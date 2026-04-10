from __future__ import annotations

import argparse
import base64
import binascii
import getpass
import hashlib
import hmac
import json
import re
import secrets
import threading
import time
import unicodedata
from datetime import datetime, timezone
from http import HTTPStatus
from http.cookies import SimpleCookie
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, quote, urlparse

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
UPLOADS_DIR = BASE_DIR / "uploads"
STATE_FILE = DATA_DIR / "state.json"
AUTH_FILE = DATA_DIR / "auth.json"
STATE_LOCK = threading.Lock()
AUTH_LOCK = threading.Lock()
SESSION_LOCK = threading.Lock()
SESSIONS: dict[str, dict[str, object]] = {}
IMAGE_STAGE_KEYS = {"sprout", "flower", "harvest"}
DATA_URL_PATTERN = re.compile(r"^data:(image/[a-zA-Z0-9.+-]+);base64,(.+)$")
HEX_PATTERN = re.compile(r"^[0-9a-f]+$")
COMPETITION_YEAR_PATTERN = re.compile(r"(?:19|20)\d{2}")
DEFAULT_PARTICIPANT_PASSWORD = "Odlingskampen"
IMAGE_EXTENSIONS = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/avif": ".avif",
}
SESSION_COOKIE_NAME = "odlingskampen_session"
SESSION_TTL_SECONDS = 24 * 60 * 60
PASSWORD_ITERATIONS = 200_000
DEFAULT_ADMIN_USERNAME = "admin"
DEFAULT_ADMIN_PASSWORD = "Odlingskampen2026"


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def current_year() -> int:
    return datetime.now(timezone.utc).year


def sanitize_year(value: object, fallback: int | None = None) -> int:
    fallback_year = fallback if isinstance(fallback, int) else current_year()
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return fallback_year
    return max(2000, min(2100, parsed))


def extract_competition_year(value: object, fallback: int | None = None) -> int:
    fallback_year = sanitize_year(fallback, current_year())
    if not isinstance(value, str):
        return fallback_year
    matches = COMPETITION_YEAR_PATTERN.findall(value)
    if not matches:
        return fallback_year
    return sanitize_year(matches[-1], fallback_year)


def default_event_name_for_year(year: int) -> str:
    return f"Odlingskampen {year}"


def replace_or_append_competition_year(event_name: str, year: int) -> str:
    clean_name = sanitize_text(event_name, 120)
    if not clean_name:
        return default_event_name_for_year(year)

    matches = list(COMPETITION_YEAR_PATTERN.finditer(clean_name))
    if matches:
        last_match = matches[-1]
        updated_name = f"{clean_name[:last_match.start()]}{year}{clean_name[last_match.end():]}"
        return sanitize_text(updated_name, 120) or default_event_name_for_year(year)

    return sanitize_text(f"{clean_name} {year}", 120) or default_event_name_for_year(year)


def allocate_competition_id(year: int, existing_ids: set[str] | None = None) -> str:
    seen_ids = existing_ids or set()
    base_id = sanitize_id(f"comp_{year}") or "comp"
    candidate_id = base_id
    suffix = 2
    while candidate_id in seen_ids:
        candidate_id = sanitize_id(f"{base_id}_{suffix}") or f"comp_{year}_{suffix}"
        suffix += 1
    return candidate_id[:40]


def default_competition(year: int | None = None, event_name: str = "", event_subtitle: str = "", created_at: str = "") -> dict:
    competition_year = sanitize_year(year, current_year())
    timestamp = sanitize_timestamp(created_at) or utc_now_iso()
    return {
        "id": allocate_competition_id(competition_year),
        "year": competition_year,
        "eventName": sanitize_text(event_name, 120) or default_event_name_for_year(competition_year),
        "eventSubtitle": sanitize_text(event_subtitle, 140) or "Företagets live-scoreboard för fruktvägningen.",
        "participants": [],
        "weighIns": [],
        "presentation": {
            "mode": "board",
            "spotlightParticipantId": "",
            "spotlightAutoplay": True,
            "spotlightIntervalSec": 8,
            "spotlightAnchorAt": timestamp,
            "weighInShowcase": {
                "token": "",
                "participantId": "",
                "phase": "idle",
                "finalWeightKg": None,
                "startedAt": "",
            },
        },
        "createdAt": timestamp,
        "updatedAt": timestamp,
    }


def default_state() -> dict:
    competition = default_competition()
    return {
        "version": 3,
        "activeCompetitionId": competition["id"],
        "competitions": [competition],
        "updatedAt": competition["updatedAt"],
    }
    return {
        "version": 2,
        "eventName": "Odlingskampen",
        "eventSubtitle": "Företagets live-scoreboard för fruktvägningen.",
        "participants": [],
        "weighIns": [],
        "presentation": {
            "mode": "board",
            "spotlightParticipantId": "",
            "spotlightAutoplay": True,
            "spotlightIntervalSec": 8,
            "spotlightAnchorAt": utc_now_iso(),
            "weighInShowcase": {
                "token": "",
                "participantId": "",
                "phase": "idle",
                "finalWeightKg": None,
                "startedAt": "",
            },
        },
        "updatedAt": utc_now_iso(),
    }


def sanitize_text(value: object, max_length: int) -> str:
    if not isinstance(value, str):
        return ""
    return value.strip()[:max_length]


def sanitize_id(value: object) -> str:
    if not isinstance(value, str):
        return ""
    allowed = "".join(character for character in value if character.isalnum() or character in {"_", "-"})
    return allowed[:40]


def sanitize_bool(value: object, fallback: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered == "true":
            return True
        if lowered == "false":
            return False
    if isinstance(value, (int, float)):
        return bool(value)
    return fallback


def sanitize_interval(value: object) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return 8
    return max(5, min(30, parsed))


def sanitize_stage_key(value: object) -> str:
    if not isinstance(value, str):
        return ""
    stage_key = value.strip().lower()
    return stage_key if stage_key in IMAGE_STAGE_KEYS else ""


def sanitize_image_path(value: object) -> str:
    if not isinstance(value, str):
        return ""
    text = value.strip()
    if not text:
        return ""
    if text.startswith("data:image/"):
        return text
    if text.startswith("/uploads/"):
        return text
    if text.startswith("uploads/"):
        return f"/{text}"
    return ""


def sanitize_image_offset(value: object, fallback: float = 0.0) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return fallback
    return round(max(-35.0, min(35.0, parsed)), 2)


def sanitize_image_scale(value: object, fallback: float = 1.0) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return fallback
    return round(max(1.0, min(2.5, parsed)), 3)


def create_participant_image(path: str = "", position_x: float = 0.0, position_y: float = 0.0, scale: float = 1.0) -> dict:
    clean_path = sanitize_image_path(path)
    if not clean_path:
        return {
            "path": "",
            "positionX": 0.0,
            "positionY": 0.0,
            "scale": 1.0,
        }
    return {
        "path": clean_path,
        "positionX": sanitize_image_offset(position_x),
        "positionY": sanitize_image_offset(position_y),
        "scale": sanitize_image_scale(scale),
    }


def sanitize_participant_image_entry(value: object) -> dict:
    if isinstance(value, str):
        return create_participant_image(value)

    if not isinstance(value, dict):
        return create_participant_image()

    return create_participant_image(
        value.get("path") or value.get("imagePath") or value.get("src") or "",
        value.get("positionX"),
        value.get("positionY"),
        value.get("scale"),
    )


def sanitize_participant_images(value: object) -> dict:
    images = value if isinstance(value, dict) else {}
    return {
        "sprout": sanitize_participant_image_entry(images.get("sprout")),
        "flower": sanitize_participant_image_entry(images.get("flower")),
        "harvest": sanitize_participant_image_entry(images.get("harvest")),
    }


def sanitize_weight(value: object) -> float | None:
    try:
        parsed = round(float(value), 3)
    except (TypeError, ValueError):
        return None
    if parsed < 0 or parsed > 999.999:
        return None
    return parsed


def sanitize_rank(value: object) -> int | None:
    if value in {None, "", 0}:
        return None
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return None
    return parsed if parsed > 0 else None


def sanitize_timestamp(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    text = value.strip()
    if not text:
        return None
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def sanitize_presentation(value: object, participant_ids: list[str]) -> dict:
    presentation = value if isinstance(value, dict) else {}
    spotlight_participant_id = sanitize_id(presentation.get("spotlightParticipantId"))
    if spotlight_participant_id not in participant_ids:
        spotlight_participant_id = participant_ids[0] if participant_ids else ""
    weigh_in_showcase = sanitize_weigh_in_showcase(presentation.get("weighInShowcase"), participant_ids)
    return {
        "mode": "spotlight" if presentation.get("mode") == "spotlight" else "board",
        "spotlightParticipantId": spotlight_participant_id,
        "spotlightAutoplay": sanitize_bool(presentation.get("spotlightAutoplay"), True),
        "spotlightIntervalSec": sanitize_interval(presentation.get("spotlightIntervalSec")),
        "spotlightAnchorAt": sanitize_timestamp(presentation.get("spotlightAnchorAt")) or utc_now_iso(),
        "weighInShowcase": weigh_in_showcase,
    }


def sanitize_weigh_in_showcase(value: object, participant_ids: list[str]) -> dict:
    showcase = value if isinstance(value, dict) else {}
    participant_id = sanitize_id(showcase.get("participantId"))
    phase = showcase.get("phase") if isinstance(showcase.get("phase"), str) else "idle"
    token = sanitize_id(showcase.get("token"))
    started_at = sanitize_timestamp(showcase.get("startedAt")) or ""

    if participant_id not in participant_ids:
        return create_empty_weigh_in_showcase()

    if phase == "intro":
        return {
            "token": token,
            "participantId": participant_id,
            "phase": "intro",
            "finalWeightKg": None,
            "startedAt": started_at,
        }

    final_weight_kg = sanitize_weight(showcase.get("finalWeightKg"))
    if phase == "countup" and final_weight_kg is not None:
        return {
            "token": token,
            "participantId": participant_id,
            "phase": "countup",
            "finalWeightKg": final_weight_kg,
            "startedAt": started_at,
        }

    return create_empty_weigh_in_showcase()


def create_empty_weigh_in_showcase() -> dict:
    return {
        "token": "",
        "participantId": "",
        "phase": "idle",
        "finalWeightKg": None,
        "startedAt": "",
    }


def sanitize_competition(payload: object, fallback_id: str = "", fallback_year: int | None = None, fallback_created_at: str = "") -> dict:
    raw_competition = payload if isinstance(payload, dict) else {}
    competition_year = sanitize_year(
        raw_competition.get("year"),
        extract_competition_year(raw_competition.get("eventName"), fallback_year),
    )
    base_competition = default_competition(competition_year)

    participants = []
    seen_participant_ids: set[str] = set()
    for candidate in raw_competition.get("participants", []):
        if not isinstance(candidate, dict):
            continue
        participant_id = sanitize_id(candidate.get("id"))
        name = sanitize_text(candidate.get("name"), 80)
        if not participant_id or not name or participant_id in seen_participant_ids:
            continue
        participants.append(
            {
                "id": participant_id,
                "name": name,
                "team": sanitize_text(candidate.get("team"), 80),
                "images": sanitize_participant_images(candidate.get("images")),
            }
        )
        seen_participant_ids.add(participant_id)

    participant_ids = [participant["id"] for participant in participants]
    weigh_ins = []
    seen_weigh_in_ids: set[str] = set()
    for candidate in raw_competition.get("weighIns", []):
        if not isinstance(candidate, dict):
            continue
        weigh_in_id = sanitize_id(candidate.get("id"))
        participant_id = sanitize_id(candidate.get("participantId"))
        weight_kg = sanitize_weight(candidate.get("weightKg"))
        measured_at = sanitize_timestamp(candidate.get("measuredAt")) or utc_now_iso()
        if not weigh_in_id or weigh_in_id in seen_weigh_in_ids or participant_id not in participant_ids or weight_kg is None:
            continue
        weigh_ins.append(
            {
                "id": weigh_in_id,
                "participantId": participant_id,
                "weightKg": weight_kg,
                "measuredAt": measured_at,
                "previousRank": sanitize_rank(candidate.get("previousRank")),
                "rankAfter": sanitize_rank(candidate.get("rankAfter")),
            }
        )
        seen_weigh_in_ids.add(weigh_in_id)

    weigh_ins.sort(key=lambda item: (item["measuredAt"], item["id"]))
    created_at = sanitize_timestamp(raw_competition.get("createdAt")) or sanitize_timestamp(fallback_created_at) or utc_now_iso()
    return {
        "id": sanitize_id(raw_competition.get("id")) or sanitize_id(fallback_id) or base_competition["id"],
        "year": competition_year,
        "eventName": sanitize_text(raw_competition.get("eventName"), 120) or base_competition["eventName"],
        "eventSubtitle": sanitize_text(raw_competition.get("eventSubtitle"), 140) or base_competition["eventSubtitle"],
        "participants": participants,
        "weighIns": weigh_ins,
        "presentation": sanitize_presentation(raw_competition.get("presentation"), participant_ids),
        "createdAt": created_at,
        "updatedAt": sanitize_timestamp(raw_competition.get("updatedAt")) or utc_now_iso(),
    }


def sanitize_state(payload: object) -> dict:
    raw_state = payload if isinstance(payload, dict) else {}
    result = default_state()

    competitions: list[dict] = []
    seen_competition_ids: set[str] = set()

    if isinstance(raw_state.get("competitions"), list):
        for candidate in raw_state.get("competitions", []):
            sanitized_competition = sanitize_competition(candidate)
            competition_id = sanitize_id(sanitized_competition["id"])
            if not competition_id or competition_id in seen_competition_ids:
                competition_id = allocate_competition_id(sanitized_competition["year"], seen_competition_ids)
            sanitized_competition["id"] = competition_id
            competitions.append(sanitized_competition)
            seen_competition_ids.add(competition_id)
    elif any(key in raw_state for key in {"eventName", "eventSubtitle", "participants", "weighIns", "presentation"}):
        migrated_competition = sanitize_competition(raw_state)
        migrated_competition["id"] = allocate_competition_id(migrated_competition["year"], seen_competition_ids)
        competitions.append(migrated_competition)
        seen_competition_ids.add(migrated_competition["id"])

    if not competitions:
        competitions = result["competitions"]
        seen_competition_ids = {competitions[0]["id"]}

    active_competition_id = sanitize_id(raw_state.get("activeCompetitionId"))
    if active_competition_id not in seen_competition_ids:
        active_competition_id = competitions[0]["id"]

    result["activeCompetitionId"] = active_competition_id
    result["competitions"] = competitions
    result["updatedAt"] = sanitize_timestamp(raw_state.get("updatedAt")) or utc_now_iso()
    return result

    raw_state = payload if isinstance(payload, dict) else {}
    result = default_state()

    participants = []
    seen_participant_ids: set[str] = set()
    for candidate in raw_state.get("participants", []):
        if not isinstance(candidate, dict):
            continue
        participant_id = sanitize_id(candidate.get("id"))
        name = sanitize_text(candidate.get("name"), 80)
        if not participant_id or not name or participant_id in seen_participant_ids:
            continue
        participants.append(
            {
                "id": participant_id,
                "name": name,
                "team": sanitize_text(candidate.get("team"), 80),
                "images": sanitize_participant_images(candidate.get("images")),
            }
        )
        seen_participant_ids.add(participant_id)

    participant_ids = [participant["id"] for participant in participants]
    weigh_ins = []
    seen_weigh_in_ids: set[str] = set()
    for candidate in raw_state.get("weighIns", []):
        if not isinstance(candidate, dict):
            continue
        weigh_in_id = sanitize_id(candidate.get("id"))
        participant_id = sanitize_id(candidate.get("participantId"))
        weight_kg = sanitize_weight(candidate.get("weightKg"))
        measured_at = sanitize_timestamp(candidate.get("measuredAt")) or utc_now_iso()
        if not weigh_in_id or weigh_in_id in seen_weigh_in_ids or participant_id not in participant_ids or weight_kg is None:
            continue
        weigh_ins.append(
            {
                "id": weigh_in_id,
                "participantId": participant_id,
                "weightKg": weight_kg,
                "measuredAt": measured_at,
                "previousRank": sanitize_rank(candidate.get("previousRank")),
                "rankAfter": sanitize_rank(candidate.get("rankAfter")),
            }
        )
        seen_weigh_in_ids.add(weigh_in_id)

    weigh_ins.sort(key=lambda item: (item["measuredAt"], item["id"]))
    result["eventName"] = sanitize_text(raw_state.get("eventName"), 120) or result["eventName"]
    result["eventSubtitle"] = sanitize_text(raw_state.get("eventSubtitle"), 140) or result["eventSubtitle"]
    result["participants"] = participants
    result["weighIns"] = weigh_ins
    result["presentation"] = sanitize_presentation(raw_state.get("presentation"), participant_ids)
    result["updatedAt"] = sanitize_timestamp(raw_state.get("updatedAt")) or utc_now_iso()
    return result


def store_uploaded_image(payload: object, allowed_participant_id: str = "") -> dict:
    body = payload if isinstance(payload, dict) else {}
    participant_id = sanitize_id(body.get("participantId")) or sanitize_id(allowed_participant_id)
    stage_key = sanitize_stage_key(body.get("stageKey"))
    data_url = body.get("dataUrl")
    if not participant_id or not stage_key or not isinstance(data_url, str):
        raise ValueError("Missing participant, stage, or image data.")

    if allowed_participant_id and participant_id != sanitize_id(allowed_participant_id):
        raise ValueError("Du får bara ladda upp bilder för din egen deltagare.")

    current_state = load_state()
    participant_ids = {participant["id"] for participant in current_state.get("participants", [])}
    if participant_id not in participant_ids:
        raise ValueError("Participant does not exist.")

    match = DATA_URL_PATTERN.match(data_url.strip())
    if not match:
        raise ValueError("Unsupported image format.")
    mime_type, encoded_content = match.groups()
    extension = IMAGE_EXTENSIONS.get(mime_type)
    if extension is None:
        raise ValueError("Unsupported image type.")

    try:
        image_bytes = base64.b64decode(encoded_content, validate=True)
    except (binascii.Error, ValueError) as error:
        raise ValueError("Invalid image payload.") from error
    if not image_bytes:
        raise ValueError("Empty image payload.")

    participant_dir = UPLOADS_DIR / participant_id
    participant_dir.mkdir(parents=True, exist_ok=True)
    file_name = f"{stage_key}_{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S%f')}{extension}"
    file_path = participant_dir / file_name
    file_path.write_bytes(image_bytes)
    relative_path = file_path.relative_to(BASE_DIR).as_posix()
    return {"path": f"/{relative_path}"}


def hash_password(password: str, salt_hex: str) -> str:
    password_bytes = password.encode("utf-8")
    salt_bytes = bytes.fromhex(salt_hex)
    return hashlib.pbkdf2_hmac("sha256", password_bytes, salt_bytes, PASSWORD_ITERATIONS).hex()


def create_password_entry(password: str) -> dict:
    salt_hex = secrets.token_hex(16)
    return {
        "passwordSalt": salt_hex,
        "passwordHash": hash_password(password, salt_hex),
    }


def default_admin_auth() -> dict:
    return {
        "username": DEFAULT_ADMIN_USERNAME,
        **create_password_entry(DEFAULT_ADMIN_PASSWORD),
    }


def default_auth() -> dict:
    return {
        "admin": default_admin_auth(),
        "participantPasswords": {},
    }


def sanitize_password_entry(payload: object) -> dict | None:
    raw_entry = payload if isinstance(payload, dict) else {}
    password_salt = raw_entry.get("passwordSalt") if isinstance(raw_entry.get("passwordSalt"), str) else ""
    password_hash = raw_entry.get("passwordHash") if isinstance(raw_entry.get("passwordHash"), str) else ""

    if (
        len(password_salt) != 32
        or not HEX_PATTERN.fullmatch(password_salt)
        or len(password_hash) != 64
        or not HEX_PATTERN.fullmatch(password_hash)
    ):
        return None

    return {
        "passwordSalt": password_salt,
        "passwordHash": password_hash,
    }


def sanitize_admin_auth(payload: object) -> dict:
    raw_admin = payload if isinstance(payload, dict) else {}
    username = sanitize_text(raw_admin.get("username"), 40)
    password_entry = sanitize_password_entry(raw_admin)
    if not username or password_entry is None:
        return default_admin_auth()
    return {
        "username": username,
        **password_entry,
    }


def sanitize_participant_passwords(payload: object) -> dict:
    raw_passwords = payload if isinstance(payload, dict) else {}
    participant_passwords: dict[str, dict[str, str]] = {}
    for raw_participant_id, raw_entry in raw_passwords.items():
        participant_id = sanitize_id(raw_participant_id)
        password_entry = sanitize_password_entry(raw_entry)
        if not participant_id or password_entry is None:
            continue
        participant_passwords[participant_id] = password_entry
    return participant_passwords


def build_participant_login_username(name: str) -> str:
    ascii_text = unicodedata.normalize("NFKD", sanitize_text(name, 80)).encode("ascii", "ignore").decode("ascii")
    tokens = [token for token in re.split(r"[^A-Za-z0-9]+", ascii_text) if token]
    if not tokens:
        return "Deltagare"
    base_username = ".".join(token[:1].upper() + token[1:] for token in tokens)
    return base_username[:80]


def build_participant_username_map(participants: list[dict]) -> dict[str, str]:
    username_map: dict[str, str] = {}
    seen_counts: dict[str, int] = {}
    for participant in participants:
        participant_id = sanitize_id(participant.get("id"))
        if not participant_id:
            continue
        base_username = build_participant_login_username(str(participant.get("name", "")))
        key = base_username.casefold()
        seen_counts[key] = seen_counts.get(key, 0) + 1
        suffix = "" if seen_counts[key] == 1 else f".{seen_counts[key]}"
        username_map[participant_id] = f"{base_username}{suffix}"[:80]
    return username_map


def build_participant_lookup_by_username(participants: list[dict]) -> dict[str, dict]:
    username_map = build_participant_username_map(participants)
    lookup: dict[str, dict] = {}
    for participant in participants:
        participant_id = sanitize_id(participant.get("id"))
        username = username_map.get(participant_id)
        if not participant_id or not username:
            continue
        lookup[username.casefold()] = {
            "participantId": participant_id,
            "username": username,
            "displayName": sanitize_text(participant.get("name"), 80),
        }
    return lookup


def sanitize_auth(payload: object) -> dict:
    raw_auth = payload if isinstance(payload, dict) else {}
    if "admin" in raw_auth or "participantPasswords" in raw_auth:
        return {
            "admin": sanitize_admin_auth(raw_auth.get("admin")),
            "participantPasswords": sanitize_participant_passwords(raw_auth.get("participantPasswords")),
        }

    return {
        "admin": sanitize_admin_auth(raw_auth),
        "participantPasswords": {},
    }


def ensure_storage() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    if not STATE_FILE.exists():
        STATE_FILE.write_text(json.dumps(default_state(), ensure_ascii=False, indent=2), encoding="utf-8")
    if not AUTH_FILE.exists():
        AUTH_FILE.write_text(json.dumps(default_auth(), ensure_ascii=False, indent=2), encoding="utf-8")


def get_competition_by_id(state_payload: dict, competition_id: str) -> dict | None:
    clean_competition_id = sanitize_id(competition_id)
    for competition in state_payload.get("competitions", []):
        if competition.get("id") == clean_competition_id:
            return competition
    return None


def get_active_competition(state_payload: dict) -> dict:
    competition = get_competition_by_id(state_payload, state_payload.get("activeCompetitionId"))
    if competition is not None:
        return competition
    competitions = state_payload.get("competitions", [])
    return competitions[0] if competitions else default_competition()


def get_all_participant_ids(state_payload: dict) -> set[str]:
    return {
        participant["id"]
        for competition in state_payload.get("competitions", [])
        for participant in competition.get("participants", [])
        if sanitize_id(participant.get("id"))
    }


def build_competition_history(state_payload: dict) -> list[dict]:
    active_competition_id = sanitize_id(state_payload.get("activeCompetitionId"))
    history = []
    for competition in state_payload.get("competitions", []):
        ranked_entries = build_standings(competition)
        history.append(
            {
                "id": competition["id"],
                "year": competition["year"],
                "eventName": competition["eventName"],
                "eventSubtitle": competition["eventSubtitle"],
                "participantCount": len(competition.get("participants", [])),
                "weighedCount": len(ranked_entries),
                "weighInCount": len(competition.get("weighIns", [])),
                "updatedAt": competition["updatedAt"],
                "isActive": competition["id"] == active_competition_id,
            }
        )

    history.sort(key=lambda item: (-item["year"], item["eventName"].casefold(), item["id"]))
    return history


def build_state_response(state_payload: dict, competition_id: str = "") -> dict:
    active_competition = get_active_competition(state_payload)
    selected_competition = get_competition_by_id(state_payload, competition_id) or active_competition
    return {
        "version": 3,
        "competitionId": selected_competition["id"],
        "competitionYear": selected_competition["year"],
        "activeCompetitionId": active_competition["id"],
        "eventName": selected_competition["eventName"],
        "eventSubtitle": selected_competition["eventSubtitle"],
        "participants": selected_competition.get("participants", []),
        "weighIns": selected_competition.get("weighIns", []),
        "presentation": selected_competition.get("presentation", default_competition()["presentation"]),
        "competitionHistory": build_competition_history(state_payload),
        "updatedAt": selected_competition["updatedAt"],
    }


def prune_participant_sessions(active_participant_ids: set[str]) -> None:
    with SESSION_LOCK:
        expired_tokens = [
            token
            for token, session in SESSIONS.items()
            if session.get("role") == "participant" and sanitize_id(session.get("participantId")) not in active_participant_ids
        ]
        for token in expired_tokens:
            SESSIONS.pop(token, None)


def load_store() -> dict:
    ensure_storage()
    with STATE_LOCK:
        try:
            payload = json.loads(STATE_FILE.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            payload = default_state()
    sanitized = sanitize_state(payload)
    if sanitized != payload:
        write_store(sanitized)
    return sanitized


def write_store(payload: object) -> dict:
    ensure_storage()
    sanitized = sanitize_state(payload)
    with STATE_LOCK:
        STATE_FILE.write_text(json.dumps(sanitized, ensure_ascii=False, indent=2), encoding="utf-8")
    sync_participant_passwords(get_all_participant_ids(sanitized))
    active_participant_ids = {participant["id"] for participant in get_active_competition(sanitized).get("participants", [])}
    prune_participant_sessions(active_participant_ids)
    return sanitized


def load_state() -> dict:
    return build_state_response(load_store())

    ensure_storage()
    with STATE_LOCK:
        try:
            payload = json.loads(STATE_FILE.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            payload = default_state()
    sanitized = sanitize_state(payload)
    if sanitized != payload:
        write_state(sanitized)
    return sanitized


def write_state(payload: object) -> dict:
    raw_payload = payload if isinstance(payload, dict) else {}
    current_store = load_store()
    active_competition = get_active_competition(current_store)
    merged_payload = {
        **active_competition,
        **raw_payload,
        "id": active_competition["id"],
        "year": active_competition["year"],
        "createdAt": active_competition.get("createdAt", active_competition["updatedAt"]),
        "updatedAt": sanitize_timestamp(raw_payload.get("updatedAt")) or utc_now_iso(),
    }
    next_active_competition = sanitize_competition(
        merged_payload,
        fallback_id=active_competition["id"],
        fallback_year=active_competition["year"],
        fallback_created_at=active_competition.get("createdAt", active_competition["updatedAt"]),
    )
    next_competitions = [
        next_active_competition if competition["id"] == active_competition["id"] else competition
        for competition in current_store.get("competitions", [])
    ]
    next_store = {
        **current_store,
        "competitions": next_competitions,
        "updatedAt": utc_now_iso(),
    }
    return build_state_response(write_store(next_store))

    ensure_storage()
    sanitized = sanitize_state(payload)
    with STATE_LOCK:
        STATE_FILE.write_text(json.dumps(sanitized, ensure_ascii=False, indent=2), encoding="utf-8")
    sync_participant_passwords({participant["id"] for participant in sanitized.get("participants", [])})
    return sanitized


def load_auth() -> dict:
    ensure_storage()
    with AUTH_LOCK:
        try:
            payload = json.loads(AUTH_FILE.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            payload = default_auth()
    sanitized = sanitize_auth(payload)
    if sanitized != payload:
        write_auth(sanitized)
    return sanitized


def write_auth(payload: object) -> dict:
    ensure_storage()
    sanitized = sanitize_auth(payload)
    with AUTH_LOCK:
        AUTH_FILE.write_text(json.dumps(sanitized, ensure_ascii=False, indent=2), encoding="utf-8")
    return sanitized


def sync_participant_passwords(participant_ids: set[str]) -> None:
    auth_state = load_auth()
    next_passwords = {
        participant_id: entry
        for participant_id, entry in auth_state["participantPasswords"].items()
        if participant_id in participant_ids
    }
    for participant_id in sorted(participant_ids):
        if participant_id not in next_passwords:
            next_passwords[participant_id] = create_password_entry(DEFAULT_PARTICIPANT_PASSWORD)
    if next_passwords != auth_state["participantPasswords"]:
        write_auth(
            {
                "admin": auth_state["admin"],
                "participantPasswords": next_passwords,
            }
        )


def set_admin_password(password: str) -> dict:
    clean_password = password.strip()
    if len(clean_password) < 8:
        raise ValueError("Lösenordet måste vara minst 8 tecken.")

    current_auth = load_auth()
    return write_auth(
        {
            "admin": {
                "username": current_auth["admin"]["username"],
                **create_password_entry(clean_password),
            },
            "participantPasswords": current_auth["participantPasswords"],
        }
    )


def set_participant_password(participant_id: str, password: str) -> dict:
    clean_participant_id = sanitize_id(participant_id)
    clean_password = password.strip()
    if not clean_participant_id:
        raise ValueError("Ogiltig deltagare.")
    if len(clean_password) < 3:
        raise ValueError("Deltagarlösenordet måste vara minst 3 tecken.")

    current_state = load_store()
    participant_ids = get_all_participant_ids(current_state)
    if clean_participant_id not in participant_ids:
        raise ValueError("Deltagaren finns inte.")

    current_auth = load_auth()
    next_passwords = dict(current_auth["participantPasswords"])
    next_passwords[clean_participant_id] = create_password_entry(clean_password)
    return write_auth(
        {
            "admin": current_auth["admin"],
            "participantPasswords": next_passwords,
        }
    )


def change_participant_password(participant_id: str, current_password: str, new_password: str) -> dict:
    clean_participant_id = sanitize_id(participant_id)
    clean_current_password = current_password.strip()
    clean_new_password = new_password.strip()
    if not clean_participant_id:
        raise ValueError("Ogiltig deltagare.")
    if not clean_current_password:
        raise ValueError("Skriv in ditt nuvarande lösenord.")
    if len(clean_new_password) < 3:
        raise ValueError("Det nya lösenordet måste vara minst 3 tecken.")

    auth_state = load_auth()
    current_password_entry = auth_state["participantPasswords"].get(clean_participant_id)
    if current_password_entry is None or not verify_password(clean_current_password, current_password_entry):
        raise ValueError("Nuvarande lösenord är fel.")

    next_passwords = dict(auth_state["participantPasswords"])
    next_passwords[clean_participant_id] = create_password_entry(clean_new_password)
    return write_auth(
        {
            "admin": auth_state["admin"],
            "participantPasswords": next_passwords,
        }
    )


def verify_password(password: str, password_entry: dict) -> bool:
    candidate_hash = hash_password(password, password_entry["passwordSalt"])
    return hmac.compare_digest(candidate_hash, password_entry["passwordHash"])


def verify_admin_credentials(username: str, password: str) -> bool:
    auth_state = load_auth()
    admin_auth = auth_state["admin"]
    if sanitize_text(username, 40).casefold() != admin_auth["username"].casefold():
        return False
    return verify_password(password, admin_auth)


def resolve_login_credentials(username: str, password: str, requested_role: str = "") -> dict | None:
    clean_username = sanitize_text(username, 80)
    if not clean_username or not password:
        return None

    auth_state = load_auth()
    role_hint = requested_role if requested_role in {"admin", "participant"} else ""

    if role_hint != "participant":
        admin_auth = auth_state["admin"]
        if clean_username.casefold() == admin_auth["username"].casefold() and verify_password(password, admin_auth):
            return {
                "role": "admin",
                "username": admin_auth["username"],
                "participantId": "",
                "displayName": "Admin",
            }

    if role_hint == "admin":
        return None

    current_state = load_state()
    participant_lookup = build_participant_lookup_by_username(current_state.get("participants", []))
    participant_match = participant_lookup.get(clean_username.casefold())
    if not participant_match:
        return None

    participant_password = auth_state["participantPasswords"].get(participant_match["participantId"])
    if participant_password is None or not verify_password(password, participant_password):
        return None

    return {
        "role": "participant",
        "username": participant_match["username"],
        "participantId": participant_match["participantId"],
        "displayName": participant_match["displayName"],
    }


def create_session(session_payload: dict[str, object]) -> str:
    prune_sessions()
    token = secrets.token_urlsafe(32)
    with SESSION_LOCK:
        SESSIONS[token] = {
            "role": session_payload.get("role") if session_payload.get("role") in {"admin", "participant"} else "admin",
            "username": sanitize_text(session_payload.get("username"), 80),
            "participantId": sanitize_id(session_payload.get("participantId")),
            "displayName": sanitize_text(session_payload.get("displayName"), 80),
            "expiresAt": time.time() + SESSION_TTL_SECONDS,
        }
    return token


def prune_sessions() -> None:
    now = time.time()
    with SESSION_LOCK:
        expired_tokens = [token for token, session in SESSIONS.items() if float(session.get("expiresAt", 0)) <= now]
        for token in expired_tokens:
            SESSIONS.pop(token, None)


def delete_session(token: str) -> None:
    if not token:
        return
    with SESSION_LOCK:
        SESSIONS.pop(token, None)


def get_session(token: str) -> dict | None:
    if not token:
        return None
    prune_sessions()
    with SESSION_LOCK:
        session = SESSIONS.get(token)
        if not session:
            return None
        session["expiresAt"] = time.time() + SESSION_TTL_SECONDS
        return dict(session)


def build_session_cookie(token: str) -> str:
    return (
        f"{SESSION_COOKIE_NAME}={token}; Path=/; Max-Age={SESSION_TTL_SECONDS}; "
        "HttpOnly; SameSite=Lax"
    )


def build_expired_session_cookie() -> str:
    return f"{SESSION_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax"


def sanitize_next_path(value: object) -> str:
    if not isinstance(value, str):
        return ""
    text = value.strip()
    if not text.startswith("/") or text.startswith("//"):
        return ""
    return text[:400]


def build_standings(state_payload: dict) -> list[dict]:
    latest_weigh_in_by_participant: dict[str, dict] = {}
    for weigh_in in state_payload.get("weighIns", []):
        latest_weigh_in_by_participant[weigh_in["participantId"]] = weigh_in

    ranked_entries: list[dict] = []
    for participant in state_payload.get("participants", []):
        latest_weigh_in = latest_weigh_in_by_participant.get(participant["id"])
        if latest_weigh_in is None:
            continue
        ranked_entries.append(
            {
                "id": participant["id"],
                "name": participant["name"],
                "team": participant["team"],
                "images": participant.get("images", {}),
                "weightKg": latest_weigh_in["weightKg"],
                "measuredAt": latest_weigh_in["measuredAt"],
            }
        )

    ranked_entries.sort(key=lambda item: (-item["weightKg"], item["measuredAt"], item["name"].casefold(), item["id"]))
    for index, entry in enumerate(ranked_entries, start=1):
        entry["rank"] = index
    return ranked_entries


def create_next_competition() -> dict:
    current_state = load_store()
    active_competition = get_active_competition(current_state)
    existing_ids = {competition["id"] for competition in current_state.get("competitions", [])}
    next_year = max((competition["year"] for competition in current_state.get("competitions", [])), default=active_competition["year"]) + 1
    timestamp = utc_now_iso()
    next_competition = default_competition(
        year=next_year,
        event_name=replace_or_append_competition_year(active_competition["eventName"], next_year),
        event_subtitle=active_competition["eventSubtitle"],
        created_at=timestamp,
    )
    next_competition["id"] = allocate_competition_id(next_year, existing_ids)
    next_competition["presentation"]["spotlightIntervalSec"] = sanitize_interval(
        active_competition.get("presentation", {}).get("spotlightIntervalSec")
    )
    next_competition["presentation"]["spotlightAutoplay"] = sanitize_bool(
        active_competition.get("presentation", {}).get("spotlightAutoplay"),
        True,
    )
    next_competition["updatedAt"] = timestamp

    next_state = {
        **current_state,
        "activeCompetitionId": next_competition["id"],
        "competitions": current_state.get("competitions", []) + [next_competition],
        "updatedAt": timestamp,
    }
    return build_state_response(write_store(next_state))


def activate_competition(competition_id: str) -> dict:
    current_state = load_store()
    clean_competition_id = sanitize_id(competition_id)
    if get_competition_by_id(current_state, clean_competition_id) is None:
        raise ValueError("Tävlingen finns inte.")

    next_state = {
        **current_state,
        "activeCompetitionId": clean_competition_id,
        "updatedAt": utc_now_iso(),
    }
    return build_state_response(write_store(next_state))


def delete_competition(competition_id: str) -> dict:
    current_state = load_store()
    clean_competition_id = sanitize_id(competition_id)
    competitions = current_state.get("competitions", [])
    if get_competition_by_id(current_state, clean_competition_id) is None:
        raise ValueError("Tävlingen finns inte.")
    if len(competitions) <= 1:
        raise ValueError("Den sista tävlingen kan inte tas bort.")
    if clean_competition_id == sanitize_id(current_state.get("activeCompetitionId")):
        raise ValueError("Aktivera en annan tävling innan du tar bort den här.")

    next_state = {
        **current_state,
        "competitions": [competition for competition in competitions if competition["id"] != clean_competition_id],
        "updatedAt": utc_now_iso(),
    }
    return build_state_response(write_store(next_state))


def build_competition_results(state_payload: dict, competition_id: str = "", highlight_participant_id: str = "") -> dict:
    active_competition = get_active_competition(state_payload)
    selected_competition = get_competition_by_id(state_payload, competition_id) or active_competition
    ranked_standings = build_standings(selected_competition)
    rank_map = {entry["id"]: entry for entry in ranked_standings}
    waiting_entries = sorted(
        [candidate for candidate in selected_competition.get("participants", []) if candidate["id"] not in rank_map],
        key=lambda item: (item["name"].casefold(), item["id"]),
    )
    all_entries = ranked_standings + [
        {
            "id": waiting_entry["id"],
            "rank": None,
            "name": waiting_entry["name"],
            "team": waiting_entry["team"],
            "weightKg": None,
            "measuredAt": "",
        }
        for waiting_entry in waiting_entries
    ]

    return {
        "competitionId": selected_competition["id"],
        "competitionYear": selected_competition["year"],
        "eventName": selected_competition["eventName"],
        "eventSubtitle": selected_competition["eventSubtitle"],
        "isActive": selected_competition["id"] == active_competition["id"],
        "updatedAt": selected_competition["updatedAt"],
        "standings": [
            {
                "id": entry["id"],
                "rank": entry["rank"],
                "name": entry["name"],
                "team": entry["team"],
                "weightKg": entry["weightKg"],
                "measuredAt": entry.get("measuredAt", ""),
                "hasWeight": entry["weightKg"] is not None,
                "isSelf": bool(highlight_participant_id) and entry["id"] == highlight_participant_id,
            }
            for entry in all_entries
        ],
    }


def build_participant_context(participant_id: str, competition_id: str = "") -> dict:
    current_state = load_store()
    active_competition = get_active_competition(current_state)
    participants = active_competition.get("participants", [])
    participant = next((candidate for candidate in participants if candidate["id"] == participant_id), None)
    if participant is None:
        raise ValueError("Deltagaren finns inte längre.")

    username_map = build_participant_username_map(participants)
    active_results = build_competition_results(current_state, active_competition["id"], participant_id)
    selected_results = build_competition_results(
        current_state,
        competition_id,
        participant_id if sanitize_id(competition_id) in {"", active_competition["id"]} else "",
    )
    active_standing_entry = next((entry for entry in active_results["standings"] if entry["id"] == participant_id), None)

    return {
        "eventName": active_competition["eventName"],
        "eventSubtitle": active_competition["eventSubtitle"],
        "activeCompetitionId": active_competition["id"],
        "selectedCompetitionId": selected_results["competitionId"],
        "competitionHistory": build_competition_history(current_state),
        "selectedCompetition": {
            "id": selected_results["competitionId"],
            "year": selected_results["competitionYear"],
            "eventName": selected_results["eventName"],
            "eventSubtitle": selected_results["eventSubtitle"],
            "isActive": selected_results["isActive"],
            "updatedAt": selected_results["updatedAt"],
        },
        "participant": {
            "id": participant["id"],
            "name": participant["name"],
            "team": participant["team"],
            "username": username_map.get(participant["id"], ""),
            "images": participant.get("images", sanitize_participant_images({})),
            "weightKg": active_standing_entry["weightKg"] if active_standing_entry else None,
            "rank": active_standing_entry["rank"] if active_standing_entry else None,
            "measuredAt": active_standing_entry["measuredAt"] if active_standing_entry else None,
        },
        "standings": selected_results["standings"],
        "updatedAt": active_competition["updatedAt"],
    }

    current_state = load_state()
    participants = current_state.get("participants", [])
    participant = next((candidate for candidate in participants if candidate["id"] == participant_id), None)
    if participant is None:
        raise ValueError("Deltagaren finns inte längre.")

    ranked_standings = build_standings(current_state)
    username_map = build_participant_username_map(participants)
    rank_map = {entry["id"]: entry for entry in ranked_standings}
    waiting_entries = sorted(
        [candidate for candidate in participants if candidate["id"] not in rank_map],
        key=lambda item: (item["name"].casefold(), item["id"]),
    )
    all_entries = ranked_standings + [
        {
            "id": waiting_entry["id"],
            "rank": None,
            "name": waiting_entry["name"],
            "team": waiting_entry["team"],
            "weightKg": None,
        }
        for waiting_entry in waiting_entries
    ]
    standing_entry = rank_map.get(participant_id)

    return {
        "eventName": current_state["eventName"],
        "eventSubtitle": current_state["eventSubtitle"],
        "participant": {
            "id": participant["id"],
            "name": participant["name"],
            "team": participant["team"],
            "username": username_map.get(participant["id"], ""),
            "images": participant.get("images", sanitize_participant_images({})),
            "weightKg": standing_entry["weightKg"] if standing_entry else None,
            "rank": standing_entry["rank"] if standing_entry else None,
            "measuredAt": standing_entry["measuredAt"] if standing_entry else None,
        },
        "standings": [
            {
                "id": entry["id"],
                "rank": entry["rank"],
                "name": entry["name"],
                "team": entry["team"],
                "weightKg": entry["weightKg"],
                "hasWeight": entry["weightKg"] is not None,
                "isSelf": entry["id"] == participant_id,
            }
            for entry in all_entries
        ],
        "updatedAt": current_state["updatedAt"],
    }


def update_participant_stage_image(participant_id: str, stage_key: str, image_value: object) -> dict:
    clean_participant_id = sanitize_id(participant_id)
    clean_stage_key = sanitize_stage_key(stage_key)
    clean_image = sanitize_participant_image_entry(image_value)
    if not clean_participant_id or not clean_stage_key:
        raise ValueError("Ogiltigt bildsteg.")

    current_state = load_state()
    participant_found = False
    next_participants = []
    for participant in current_state.get("participants", []):
        if participant["id"] == clean_participant_id:
            participant_found = True
            next_participants.append(
                {
                    **participant,
                    "images": {
                        **sanitize_participant_images(participant.get("images")),
                        clean_stage_key: clean_image,
                    },
                }
            )
        else:
            next_participants.append(participant)

    if not participant_found:
        raise ValueError("Deltagaren finns inte.")

    return write_state(
        {
            **current_state,
            "participants": next_participants,
            "updatedAt": utc_now_iso(),
        }
    )


class AppHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, directory: str | None = None, **kwargs):
        super().__init__(*args, directory=str(BASE_DIR), **kwargs)

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self) -> None:
        parsed = urlparse(self.path)

        if parsed.path in {"/login", "/login.html"}:
            session = self._get_authenticated_session()
            if session is not None:
                self._redirect(self._normalize_next_target_for_session(session, self._get_next_target(parsed)))
                return
            self.path = "/login.html"
            super().do_GET()
            return

        if parsed.path.startswith("/api/"):
            session = self._require_auth(parsed)
            if session is None:
                return
            if parsed.path == "/api/state":
                if session.get("role") != "admin":
                    self._send_json({"error": "Forbidden."}, status=HTTPStatus.FORBIDDEN)
                    return
                self._send_json(load_state())
                return
            if parsed.path == "/api/participant-context":
                if session.get("role") != "participant":
                    self._send_json({"error": "Forbidden."}, status=HTTPStatus.FORBIDDEN)
                    return
                try:
                    competition_id = sanitize_id(parse_qs(parsed.query).get("competitionId", [""])[0])
                    self._send_json(build_participant_context(str(session.get("participantId", "")), competition_id))
                except ValueError as error:
                    self._send_json({"error": str(error)}, status=HTTPStatus.NOT_FOUND)
                return
            self.send_error(HTTPStatus.NOT_FOUND, "Unknown endpoint")
            return

        session = self._require_auth(parsed)
        if session is None:
            return

        if parsed.path == "/":
            self._redirect(self._default_target_for_session(session))
            return

        if not self._is_html_page_allowed(parsed.path, session):
            self._redirect(self._default_target_for_session(session))
            return
        super().do_GET()

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path not in {
            "/api/login",
            "/api/logout",
            "/api/state",
            "/api/upload-image",
            "/api/admin/competition",
            "/api/admin/participant-password",
            "/api/participant-password",
            "/api/participant-image",
        }:
            self.send_error(HTTPStatus.NOT_FOUND, "Unknown endpoint")
            return

        content_length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(content_length) if content_length > 0 else b"{}"

        try:
            payload = json.loads(body.decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError):
            self._send_json({"error": "Invalid JSON payload."}, status=HTTPStatus.BAD_REQUEST)
            return

        if parsed.path == "/api/login":
            self._handle_login(payload)
            return

        if parsed.path == "/api/logout":
            self._handle_logout()
            return

        session = self._require_auth(parsed)
        if session is None:
            return

        if parsed.path == "/api/state":
            if session.get("role") != "admin":
                self._send_json({"error": "Forbidden."}, status=HTTPStatus.FORBIDDEN)
                return
            self._send_json(write_state(payload))
            return

        try:
            if parsed.path == "/api/admin/competition":
                if session.get("role") != "admin":
                    self._send_json({"error": "Forbidden."}, status=HTTPStatus.FORBIDDEN)
                    return
                body = payload if isinstance(payload, dict) else {}
                action = sanitize_text(body.get("action"), 40).lower()
                if action == "create-next":
                    self._send_json(create_next_competition())
                    return
                if action == "activate":
                    self._send_json(activate_competition(body.get("competitionId")))
                    return
                if action == "delete":
                    self._send_json(delete_competition(body.get("competitionId")))
                    return
                self._send_json({"error": "Ogiltig tävlingsåtgärd."}, status=HTTPStatus.BAD_REQUEST)
                return

            if parsed.path == "/api/admin/participant-password":
                if session.get("role") != "admin":
                    self._send_json({"error": "Forbidden."}, status=HTTPStatus.FORBIDDEN)
                    return
                body = payload if isinstance(payload, dict) else {}
                set_participant_password(body.get("participantId"), body.get("password") if isinstance(body.get("password"), str) else "")
                self._send_json({"ok": True})
                return

            if parsed.path == "/api/participant-password":
                if session.get("role") != "participant":
                    self._send_json({"error": "Forbidden."}, status=HTTPStatus.FORBIDDEN)
                    return
                body = payload if isinstance(payload, dict) else {}
                change_participant_password(
                    str(session.get("participantId", "")),
                    body.get("currentPassword") if isinstance(body.get("currentPassword"), str) else "",
                    body.get("newPassword") if isinstance(body.get("newPassword"), str) else "",
                )
                self._send_json({"ok": True})
                return

            if parsed.path == "/api/participant-image":
                if session.get("role") != "participant":
                    self._send_json({"error": "Forbidden."}, status=HTTPStatus.FORBIDDEN)
                    return
                body = payload if isinstance(payload, dict) else {}
                updated_state = update_participant_stage_image(
                    str(session.get("participantId", "")),
                    body.get("stageKey"),
                    body.get("image", body.get("imagePath")),
                )
                self._send_json(
                    {
                        "ok": True,
                        "participant": build_participant_context(str(session.get("participantId", "")))["participant"],
                        "updatedAt": updated_state["updatedAt"],
                    }
                )
                return

            allowed_participant_id = str(session.get("participantId", "")) if session.get("role") == "participant" else ""
            self._send_json(store_uploaded_image(payload, allowed_participant_id))
        except ValueError as error:
            self._send_json({"error": str(error)}, status=HTTPStatus.BAD_REQUEST)

    def log_message(self, format: str, *args) -> None:
        print(f"[server] {self.address_string()} - {format % args}")

    def _handle_login(self, payload: object) -> None:
        body = payload if isinstance(payload, dict) else {}
        username = sanitize_text(body.get("username"), 80)
        password = body.get("password") if isinstance(body.get("password"), str) else ""
        role = sanitize_text(body.get("role"), 20).lower()
        session_payload = resolve_login_credentials(username, password, role)

        if session_payload is None:
            self._send_json({"error": "Fel användarnamn eller lösenord."}, status=HTTPStatus.UNAUTHORIZED)
            return

        next_path = self._normalize_next_target_for_session(session_payload, sanitize_next_path(body.get("next")))
        session_token = create_session(session_payload)
        self._send_json(
            {
                "ok": True,
                "next": next_path,
                "role": session_payload["role"],
                "username": session_payload["username"],
                "displayName": session_payload.get("displayName", ""),
            },
            headers={"Set-Cookie": build_session_cookie(session_token)},
        )

    def _handle_logout(self) -> None:
        session_token = self._get_session_token()
        delete_session(session_token)
        self._send_json({"ok": True}, headers={"Set-Cookie": build_expired_session_cookie()})

    def _require_auth(self, parsed) -> dict | None:
        session = self._get_authenticated_session()
        if session is not None:
            return session

        if parsed.path.startswith("/api/"):
            self._send_json({"error": "Authentication required."}, status=HTTPStatus.UNAUTHORIZED)
            return None

        self._redirect_to_login(parsed)
        return None

    def _get_authenticated_session(self) -> dict | None:
        session_token = self._get_session_token()
        return get_session(session_token)

    def _default_target_for_session(self, session: dict) -> str:
        return "/participant.html" if session.get("role") == "participant" else "/index.html?view=settings"

    def _normalize_next_target_for_session(self, session: dict, next_target: str) -> str:
        default_target = self._default_target_for_session(session)
        if not next_target:
            return default_target

        if session.get("role") == "participant":
            return next_target if next_target.startswith("/participant.html") else default_target

        if next_target == "/" or next_target.startswith("/index.html"):
            return next_target if next_target != "/" else default_target
        return default_target

    def _is_html_page_allowed(self, path: str, session: dict) -> bool:
        if not path.endswith(".html"):
            return True
        if path == "/index.html":
            return session.get("role") == "admin"
        if path == "/participant.html":
            return session.get("role") == "participant"
        return False

    def _get_session_token(self) -> str:
        cookie_header = self.headers.get("Cookie", "")
        if not cookie_header:
            return ""

        cookie = SimpleCookie()
        try:
            cookie.load(cookie_header)
        except Exception:
            return ""

        morsel = cookie.get(SESSION_COOKIE_NAME)
        return morsel.value if morsel else ""

    def _get_next_target(self, parsed) -> str:
        next_target = sanitize_next_path(parse_qs(parsed.query).get("next", [""])[0])
        if next_target:
            return next_target
        return ""

    def _redirect_to_login(self, parsed) -> None:
        next_target = sanitize_next_path(f"{parsed.path}{f'?{parsed.query}' if parsed.query else ''}") or "/index.html?view=settings"
        self._redirect(f"/login?next={quote(next_target, safe='/')}")

    def _handle_login(self, payload: object) -> None:
        body = payload if isinstance(payload, dict) else {}
        username = sanitize_text(body.get("username"), 80)
        password = body.get("password") if isinstance(body.get("password"), str) else ""
        role = sanitize_text(body.get("role"), 20).lower()
        session_payload = resolve_login_credentials(username, password, role)

        if session_payload is None:
            self._send_json({"error": "Fel användarnamn eller lösenord."}, status=HTTPStatus.UNAUTHORIZED)
            return

        next_path = self._normalize_next_target_for_session(session_payload, sanitize_next_path(body.get("next")))
        session_token = create_session(session_payload)
        self._send_json(
            {
                "ok": True,
                "next": next_path,
                "role": session_payload["role"],
                "username": session_payload["username"],
                "displayName": session_payload.get("displayName", ""),
            },
            headers={"Set-Cookie": build_session_cookie(session_token)},
        )

    def _redirect(self, location: str) -> None:
        self.send_response(HTTPStatus.SEE_OTHER)
        self.send_header("Location", location)
        self.end_headers()

    def _send_json(
        self,
        payload: object,
        status: HTTPStatus = HTTPStatus.OK,
        headers: dict[str, str] | None = None,
    ) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        for header_name, header_value in (headers or {}).items():
            self.send_header(header_name, header_value)
        self.end_headers()
        self.wfile.write(body)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Lokal server för Odlingskampen live.")
    parser.add_argument("--host", default="127.0.0.1", help="Värdnamn eller IP-adress att lyssna på.")
    parser.add_argument("--port", default=8080, type=int, help="Port för webbservern.")
    parser.add_argument(
        "--set-password",
        nargs="?",
        const="__prompt__",
        help="Sätt nytt adminlösenord och avsluta. Lämna värdet tomt för att bli promptad.",
    )
    return parser.parse_args()


def resolve_new_password(argument_value: str) -> str:
    if argument_value != "__prompt__":
        return argument_value

    first = getpass.getpass("Nytt adminlösenord: ")
    second = getpass.getpass("Bekräfta adminlösenord: ")
    if first != second:
        raise ValueError("Lösenorden matchar inte.")
    return first


def main() -> None:
    args = parse_args()
    ensure_storage()

    if args.set_password is not None:
        try:
            set_admin_password(resolve_new_password(args.set_password))
        except ValueError as error:
            raise SystemExit(str(error)) from error
        print("Adminlösenordet är uppdaterat.")
        return

    server = ThreadingHTTPServer((args.host, args.port), AppHandler)
    print(f"Odlingskampen live körs på http://{args.host}:{args.port}")
    print("Öppna /login för att logga in som admin.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStänger servern...")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
