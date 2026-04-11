const POLL_INTERVAL_MS = 4000;

const PARTICIPANT_IMAGE_STAGES = [
  { key: "sprout", label: "Första planta", emptyLabel: "Ingen bild för den första plantan än." },
  { key: "flower", label: "Första blomman", emptyLabel: "Ingen bild för pollinerad blomma än." },
  { key: "harvest", label: "Skördad frukt", emptyLabel: "Ingen bild på skördad frukt än." },
];

const dateTimeFormatter = new Intl.DateTimeFormat("sv-SE", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const dom = {};
const runtime = {
  pollHandle: null,
  syncMode: "starting",
  noticeHandle: null,
  selectedCompetitionId: "",
  imageAdjustSession: null,
};

let context = null;

document.addEventListener("DOMContentLoaded", async () => {
  cacheDom();
  bindEvents();
  await syncFromServer({ allowFallbackNotice: false });
  startPolling();
});

function cacheDom() {
  dom.menuToggleButton = document.getElementById("participant-menu-toggle-btn");
  dom.topbarMenu = document.getElementById("participant-mobile-menu");
  dom.syncStatus = document.getElementById("participant-sync-status");
  dom.rulesOpenButton = document.getElementById("participant-rules-open-btn");
  dom.passwordOpenButton = document.getElementById("participant-password-open-btn");
  dom.logoutButton = document.getElementById("participant-logout-btn");
  dom.notice = document.getElementById("participant-notice");
  dom.pageName = document.getElementById("participant-page-name");
  dom.pageLogin = document.getElementById("participant-page-login");
  dom.pageTeam = document.getElementById("participant-page-team");
  dom.pageIdentity = document.querySelector(".participant-identity");
  dom.pageRank = document.getElementById("participant-page-rank");
  dom.pageWeight = document.getElementById("participant-page-weight");
  dom.summaryGrid = document.querySelector(".participant-summary-grid");
  dom.rankCard = dom.pageRank ? dom.pageRank.closest(".summary-card") : null;
  dom.weightCard = dom.pageWeight ? dom.pageWeight.closest(".summary-card") : null;
  dom.passwordForm = document.getElementById("participant-password-form");
  dom.currentPassword = document.getElementById("participant-current-password");
  dom.newPassword = document.getElementById("participant-new-password");
  dom.confirmPassword = document.getElementById("participant-confirm-password");
  dom.passwordSaveButton = document.getElementById("participant-password-save-btn");
  dom.passwordDialog = document.getElementById("participant-password-dialog");
  dom.passwordDialogBody = document.getElementById("participant-password-dialog-body");
  dom.passwordCancelButton = document.getElementById("participant-password-cancel-btn");
  dom.rulesDialog = document.getElementById("participant-rules-dialog");
  dom.rulesTitle = document.getElementById("participant-rules-title");
  dom.rulesCopy = document.getElementById("participant-rules-copy");
  dom.rulesCloseButton = document.getElementById("participant-rules-close-btn");
  dom.competitionSelect = document.getElementById("participant-competition-select");
  dom.competitionCopy = document.getElementById("participant-competition-copy");
  dom.standingsList = document.getElementById("participant-standings-list");
  dom.stageInputs = new Map(
    Array.from(document.querySelectorAll("[data-stage-input]")).map((element) => [element.dataset.stageInput, element]),
  );
  dom.stageRemoveButtons = new Map(
    Array.from(document.querySelectorAll("[data-stage-remove]")).map((element) => [element.dataset.stageRemove, element]),
  );
  dom.stageAdjustButtons = new Map(
    Array.from(document.querySelectorAll("[data-stage-adjust]")).map((element) => [element.dataset.stageAdjust, element]),
  );
  dom.stageStatus = new Map(
    Array.from(document.querySelectorAll("[data-stage-status]")).map((element) => [element.dataset.stageStatus, element]),
  );
  dom.stagePreviewImages = new Map(
    Array.from(document.querySelectorAll("[data-stage-preview]")).map((element) => [element.dataset.stagePreview, element]),
  );
  dom.stagePreviewEmpty = new Map(
    Array.from(document.querySelectorAll("[data-stage-empty]")).map((element) => [element.dataset.stageEmpty, element]),
  );
  dom.imageAdjustDialog = document.getElementById("image-adjust-dialog");
  dom.imageAdjustTitle = document.getElementById("image-adjust-title");
  dom.imageAdjustCopy = document.getElementById("image-adjust-copy");
  dom.imageAdjustPreview = document.getElementById("image-adjust-preview");
  dom.imageAdjustResultPreview = document.getElementById("image-adjust-result-preview");
  dom.imageAdjustEmpty = document.getElementById("image-adjust-empty");
  dom.imageAdjustWorkspaceShell = document.getElementById("image-adjust-workspace-shell");
  dom.imageAdjustScale = document.getElementById("image-adjust-scale");

  if (dom.pageIdentity && dom.pageTeam && dom.pageLogin) {
    dom.pageTeam.insertAdjacentElement("afterend", dom.pageLogin);
  }
  dom.imageAdjustOffsetX = document.getElementById("image-adjust-offset-x");
  dom.imageAdjustOffsetY = document.getElementById("image-adjust-offset-y");
  dom.imageAdjustCancelButton = document.getElementById("image-adjust-cancel-btn");
  dom.imageAdjustSaveButton = document.getElementById("image-adjust-save-btn");
}

function setMobileMenuOpen(isOpen) {
  if (!(dom.menuToggleButton instanceof HTMLButtonElement) || !(dom.topbarMenu instanceof HTMLElement)) {
    return;
  }

  dom.menuToggleButton.setAttribute("aria-expanded", String(isOpen));
  dom.topbarMenu.classList.toggle("is-open", isOpen);
}

function bindEvents() {
  movePasswordFormToDialog();

  if (dom.passwordOpenButton instanceof HTMLButtonElement) {
    dom.passwordOpenButton.addEventListener("click", openPasswordDialog);
  }

  if (dom.rulesOpenButton instanceof HTMLButtonElement) {
    dom.rulesOpenButton.addEventListener("click", openRulesDialog);
  }

  dom.logoutButton.addEventListener("click", async () => {
    await logoutSession();
    redirectToLogin();
  });

  if (dom.menuToggleButton instanceof HTMLButtonElement) {
    dom.menuToggleButton.addEventListener("click", () => {
      const isOpen = dom.menuToggleButton.getAttribute("aria-expanded") === "true";
      setMobileMenuOpen(!isOpen);
    });
  }

  document.addEventListener("click", (event) => {
    if (!(dom.menuToggleButton instanceof HTMLButtonElement) || !(dom.topbarMenu instanceof HTMLElement)) {
      return;
    }

    const target = event.target;
    if (!(target instanceof Node)) {
      return;
    }

    if (dom.menuToggleButton.contains(target) || dom.topbarMenu.contains(target)) {
      return;
    }

    setMobileMenuOpen(false);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      setMobileMenuOpen(false);
    }
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 900) {
      setMobileMenuOpen(false);
    }
  });

  dom.passwordForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const currentPassword = dom.currentPassword.value.trim();
    const newPassword = dom.newPassword.value.trim();
    const confirmPassword = dom.confirmPassword.value.trim();

    if (!currentPassword) {
      notify("Skriv in ditt nuvarande lösenord.");
      dom.currentPassword.focus();
      return;
    }

    if (newPassword.length < 3) {
      notify("Det nya lösenordet måste vara minst 3 tecken.");
      dom.newPassword.focus();
      return;
    }

    if (newPassword !== confirmPassword) {
      notify("Det nya lösenordet och bekräftelsen matchar inte.");
      dom.confirmPassword.focus();
      return;
    }

    try {
      dom.passwordSaveButton.disabled = true;
      await persistParticipantPasswordChange(currentPassword, newPassword);
      dom.passwordForm.reset();
      closePasswordDialog();
      notify("Ditt lösenord är uppdaterat.");
    } catch (error) {
      console.warn("Kunde inte byta deltagarlösenord.", error);
      notify(error instanceof Error ? error.message : "Det gick inte att byta lösenord.");
    } finally {
      dom.passwordSaveButton.disabled = false;
    }
  });

  dom.competitionSelect.addEventListener("change", async () => {
    runtime.selectedCompetitionId = sanitizeId(dom.competitionSelect.value);
    await syncFromServer({ allowFallbackNotice: false, competitionId: runtime.selectedCompetitionId });
  });

  dom.stageInputs.forEach((input, stageKey) => {
    input.addEventListener("change", async (event) => {
      const fileList = event.target.files;
      const file = fileList && fileList.length ? fileList[0] : null;
      event.target.value = "";

      if (!file || !context || !context.participant) {
        return;
      }

      try {
        notify(`Laddar upp bild för ${getStageLabel(stageKey).toLowerCase()}...`);
        const imagePath = await storeParticipantStageImage(file, context.participant.id, stageKey);
        await persistParticipantStageImage(stageKey, createParticipantImage(imagePath));
        await syncFromServer({ allowFallbackNotice: false, competitionId: runtime.selectedCompetitionId });
        openImageAdjustDialog(stageKey);
        notify("Bilden är sparad. Justera utsnittet vid behov.");
      } catch (error) {
        console.warn("Kunde inte spara deltagarbilden.", error);
        notify(error instanceof Error ? error.message : "Det gick inte att spara bilden.");
      }
    });
  });

  dom.stageRemoveButtons.forEach((button, stageKey) => {
    button.addEventListener("click", async () => {
      if (!context || !context.participant) {
        return;
      }

      const currentImage = normalizeParticipantImage(context.participant.images && context.participant.images[stageKey]);
      if (!currentImage.path) {
        notify("Det finns ingen bild att ta bort för det steget.");
        return;
      }

      try {
        await persistParticipantStageImage(stageKey, createParticipantImage());
        await syncFromServer({ allowFallbackNotice: false, competitionId: runtime.selectedCompetitionId });
        notify("Bilden är borttagen.");
      } catch (error) {
        console.warn("Kunde inte ta bort deltagarbilden.", error);
        notify(error instanceof Error ? error.message : "Det gick inte att ta bort bilden.");
      }
    });
  });

  dom.stageAdjustButtons.forEach((button, stageKey) => {
    button.addEventListener("click", () => {
      if (!context || !context.participant) {
        notify("Ladda upp en bild innan du justerar utsnittet.");
        return;
      }

      const image = normalizeParticipantImage(context.participant.images && context.participant.images[stageKey]);
      if (!image.path) {
        notify("Ladda upp en bild innan du justerar utsnittet.");
        return;
      }

      openImageAdjustDialog(stageKey, image);
    });
  });

  if (dom.imageAdjustScale instanceof HTMLInputElement) {
    dom.imageAdjustScale.addEventListener("input", syncImageAdjustPreviewFromControls);
  }

  if (dom.imageAdjustOffsetX instanceof HTMLInputElement) {
    dom.imageAdjustOffsetX.addEventListener("input", syncImageAdjustPreviewFromControls);
  }

  if (dom.imageAdjustOffsetY instanceof HTMLInputElement) {
    dom.imageAdjustOffsetY.addEventListener("input", syncImageAdjustPreviewFromControls);
  }

  if (dom.imageAdjustCancelButton instanceof HTMLButtonElement) {
    dom.imageAdjustCancelButton.addEventListener("click", closeImageAdjustDialog);
  }

  if (dom.imageAdjustSaveButton instanceof HTMLButtonElement) {
    dom.imageAdjustSaveButton.addEventListener("click", async () => {
      await saveImageAdjustDialog();
    });
  }

  if (dom.imageAdjustWorkspaceShell instanceof HTMLElement) {
    dom.imageAdjustWorkspaceShell.addEventListener("pointerdown", startImageAdjustDrag);
    dom.imageAdjustWorkspaceShell.addEventListener("pointermove", moveImageAdjustDrag);
    dom.imageAdjustWorkspaceShell.addEventListener("pointerup", endImageAdjustDrag);
    dom.imageAdjustWorkspaceShell.addEventListener("pointercancel", endImageAdjustDrag);
  }

  if (dom.passwordCancelButton instanceof HTMLButtonElement) {
    dom.passwordCancelButton.addEventListener("click", closePasswordDialog);
  }

  if (dom.rulesCloseButton instanceof HTMLButtonElement) {
    dom.rulesCloseButton.addEventListener("click", closeRulesDialog);
  }

  if (dom.passwordDialog instanceof HTMLDialogElement) {
    dom.passwordDialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      closePasswordDialog();
    });
    dom.passwordDialog.addEventListener("close", resetPasswordForm);
  }

  if (dom.rulesDialog instanceof HTMLDialogElement) {
    dom.rulesDialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      closeRulesDialog();
    });
  }

  if (dom.imageAdjustDialog instanceof HTMLDialogElement) {
    dom.imageAdjustDialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      closeImageAdjustDialog();
    });
    dom.imageAdjustDialog.addEventListener("close", () => {
      runtime.imageAdjustSession = null;
    });
  }

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      syncFromServer({ competitionId: runtime.selectedCompetitionId });
    }
  });
}

function movePasswordFormToDialog() {
  if (!(dom.passwordForm instanceof HTMLElement) || !(dom.passwordDialogBody instanceof HTMLElement)) {
    return;
  }

  dom.passwordForm.classList.add("participant-password-form--dialog");
  const buttonRow = dom.passwordForm.querySelector(".button-row");
  if (buttonRow instanceof HTMLElement && !(dom.passwordCancelButton instanceof HTMLButtonElement)) {
    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.id = "participant-password-cancel-btn";
    cancelButton.className = "ghost-button";
    cancelButton.textContent = "Avbryt";
    buttonRow.prepend(cancelButton);
    dom.passwordCancelButton = cancelButton;
  }

  dom.passwordDialogBody.appendChild(dom.passwordForm);
}

function openPasswordDialog() {
  if (!(dom.passwordDialog instanceof HTMLDialogElement)) {
    return;
  }

  if (!dom.passwordDialog.open) {
    dom.passwordDialog.showModal();
  }

  dom.currentPassword?.focus();
}

function closePasswordDialog() {
  if (dom.passwordDialog instanceof HTMLDialogElement && dom.passwordDialog.open) {
    dom.passwordDialog.close();
  }
}

function openRulesDialog() {
  if (!(dom.rulesDialog instanceof HTMLDialogElement)) {
    return;
  }

  renderRulesDialog();
  setMobileMenuOpen(false);

  if (!dom.rulesDialog.open) {
    dom.rulesDialog.showModal();
  }
}

function closeRulesDialog() {
  if (dom.rulesDialog instanceof HTMLDialogElement && dom.rulesDialog.open) {
    dom.rulesDialog.close();
  }
}

function resetPasswordForm() {
  if (!(dom.passwordForm instanceof HTMLFormElement)) {
    return;
  }

  dom.passwordForm.reset();
  if (dom.passwordSaveButton instanceof HTMLButtonElement) {
    dom.passwordSaveButton.disabled = false;
  }
}

function startPolling() {
  window.clearInterval(runtime.pollHandle);
  runtime.pollHandle = window.setInterval(() => {
    syncFromServer({ competitionId: runtime.selectedCompetitionId });
  }, POLL_INTERVAL_MS);
}

async function syncFromServer(options = {}) {
  const requestedCompetitionId = sanitizeId(options.competitionId ?? runtime.selectedCompetitionId);
  const url = requestedCompetitionId
    ? `/api/participant-context?competitionId=${encodeURIComponent(requestedCompetitionId)}`
    : "/api/participant-context";

  try {
    const response = await fetch(url, { cache: "no-store" });
    if (response.status === 401) {
      redirectToLogin();
      return context;
    }

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || `Status ${response.status}`);
    }

    context = normalizeParticipantContext(payload);
    runtime.selectedCompetitionId = context.selectedCompetition.id || context.activeCompetitionId || "";
    setSyncMode("server");
    render();
    return context;
  } catch (error) {
    console.warn("Kunde inte hämta deltagardata.", error);
    setSyncMode("warning");
    if (options.allowFallbackNotice !== false) {
      notify("Servern svarar inte just nu. Visar senast kända data.");
    }
    return context;
  }
}

function render() {
  renderProfile();
  renderGallery();
  renderCompetitionSelector();
  renderRulesDialog();
  renderStandings();
}

function renderProfile() {
  if (!context || !context.participant) {
    dom.pageName.textContent = "Deltagare saknas";
    dom.pageLogin.textContent = "Kunde inte läsa in deltagardata.";
    dom.pageTeam.textContent = "-";
    setProfileMetricVisibility(false, false);
    return;
  }

  const participant = context.participant;
  const hasRank = Number.isFinite(participant.rank) && participant.rank > 0;
  const hasWeight = typeof participant.weightKg === "number" && Number.isFinite(participant.weightKg);
  dom.pageName.textContent = participant.name || "Deltagare";
  dom.pageLogin.textContent = participant.username
    ? `Ditt inloggningsnamn är ${participant.username}.`
    : "Inloggningsnamn saknas.";
  dom.pageTeam.textContent = participant.team || "Ingen avdelning angiven";
  if (dom.pageRank instanceof HTMLElement) {
    dom.pageRank.textContent = hasRank ? `Plats ${participant.rank}` : "";
  }
  if (dom.pageWeight instanceof HTMLElement) {
    dom.pageWeight.textContent = hasWeight ? formatWeight(participant.weightKg) : "";
  }
  setProfileMetricVisibility(hasRank, hasWeight);
}

function setProfileMetricVisibility(hasRank, hasWeight) {
  if (dom.rankCard) {
    dom.rankCard.hidden = !hasRank;
  }
  if (dom.weightCard) {
    dom.weightCard.hidden = !hasWeight;
  }
  if (dom.summaryGrid) {
    dom.summaryGrid.hidden = !hasRank && !hasWeight;
  }
}

function renderGallery() {
  const participant = context && context.participant ? context.participant : null;
  const images = participant && participant.images ? participant.images : createEmptyParticipantImages();
  const editable = Boolean(participant);

  PARTICIPANT_IMAGE_STAGES.forEach((stage) => {
    const image = normalizeParticipantImage(images[stage.key]);
    const imagePath = image.path;
    const input = dom.stageInputs.get(stage.key);
    const adjustButton = dom.stageAdjustButtons.get(stage.key);
    const removeButton = dom.stageRemoveButtons.get(stage.key);
    const previewImage = dom.stagePreviewImages.get(stage.key);
    const emptyState = dom.stagePreviewEmpty.get(stage.key);
    const status = dom.stageStatus.get(stage.key);

    input.disabled = !editable;
    if (adjustButton) {
      adjustButton.disabled = !editable || !imagePath;
    }
    if (removeButton) {
      removeButton.disabled = !editable || !imagePath;
    }
    previewImage.hidden = !imagePath;
    previewImage.src = imagePath || "";
    previewImage.alt = participant ? `${participant.name} - ${stage.label}` : "";
    applyParticipantImageStyle(previewImage, image);
    emptyState.hidden = Boolean(imagePath);
    emptyState.textContent = participant ? stage.emptyLabel : "Ingen deltagare inloggad.";
    status.textContent = participant
      ? imagePath
        ? `Bild sparad för ${stage.label.toLowerCase()}.`
        : stage.emptyLabel
      : "Ingen deltagare inloggad.";
  });
}

function openImageAdjustDialog(stageKey, imageValue = null) {
  if (!(dom.imageAdjustDialog instanceof HTMLDialogElement) || !context || !context.participant) {
    return;
  }

  const image = normalizeParticipantImage(imageValue || (context.participant.images && context.participant.images[stageKey]));
  if (!image.path) {
    notify("Ladda upp en bild innan du justerar utsnittet.");
    return;
  }

  runtime.imageAdjustSession = {
    stageKey,
    image,
    drag: null,
  };

  const stageLabel = getStageLabel(stageKey);
  if (dom.imageAdjustTitle instanceof HTMLElement) {
    dom.imageAdjustTitle.textContent = `Justera ${stageLabel}`;
  }
  if (dom.imageAdjustCopy instanceof HTMLElement) {
    dom.imageAdjustCopy.textContent = "Dra bilden direkt i rutan eller använd reglagen för finjustering.";
  }

  syncImageAdjustControls(image);
  renderImageAdjustPreview(image, context.participant.name, stageLabel);

  if (!dom.imageAdjustDialog.open) {
    dom.imageAdjustDialog.showModal();
  }
}

function syncImageAdjustControls(imageValue) {
  const image = normalizeParticipantImage(imageValue);
  if (dom.imageAdjustScale instanceof HTMLInputElement) {
    dom.imageAdjustScale.value = String(image.scale);
  }
  if (dom.imageAdjustOffsetX instanceof HTMLInputElement) {
    dom.imageAdjustOffsetX.value = String(image.positionX);
  }
  if (dom.imageAdjustOffsetY instanceof HTMLInputElement) {
    dom.imageAdjustOffsetY.value = String(image.positionY);
  }
}

function syncImageAdjustPreviewFromControls() {
  if (!runtime.imageAdjustSession) {
    return;
  }

  const nextImage = createParticipantImage(
    runtime.imageAdjustSession.image.path,
    dom.imageAdjustOffsetX instanceof HTMLInputElement ? dom.imageAdjustOffsetX.value : runtime.imageAdjustSession.image.positionX,
    dom.imageAdjustOffsetY instanceof HTMLInputElement ? dom.imageAdjustOffsetY.value : runtime.imageAdjustSession.image.positionY,
    dom.imageAdjustScale instanceof HTMLInputElement ? dom.imageAdjustScale.value : runtime.imageAdjustSession.image.scale,
  );
  updateImageAdjustSessionImage(nextImage);
}

function renderImageAdjustPreview(imageValue, participantName, stageLabel) {
  const image = normalizeParticipantImage(imageValue);
  if (
    !(dom.imageAdjustPreview instanceof HTMLImageElement) ||
    !(dom.imageAdjustResultPreview instanceof HTMLImageElement) ||
    !(dom.imageAdjustEmpty instanceof HTMLElement)
  ) {
    return;
  }

  const hasImage = Boolean(image.path);
  dom.imageAdjustPreview.hidden = !hasImage;
  dom.imageAdjustResultPreview.hidden = !hasImage;
  dom.imageAdjustEmpty.hidden = hasImage;
  dom.imageAdjustPreview.alt = participantName ? `${participantName} - ${stageLabel}` : stageLabel;
  dom.imageAdjustResultPreview.alt = participantName ? `${participantName} - ${stageLabel}` : stageLabel;
  dom.imageAdjustPreview.src = image.path || "";
  dom.imageAdjustResultPreview.src = image.path || "";
  applyParticipantImageStyle(dom.imageAdjustPreview, image);
  applyParticipantImageStyle(dom.imageAdjustResultPreview, image);
}

function closeImageAdjustDialog() {
  setImageAdjustDragging(false);
  runtime.imageAdjustSession = null;
  if (dom.imageAdjustDialog instanceof HTMLDialogElement && dom.imageAdjustDialog.open) {
    dom.imageAdjustDialog.close();
  }
}

async function saveImageAdjustDialog() {
  if (!runtime.imageAdjustSession) {
    closeImageAdjustDialog();
    return;
  }

  await persistParticipantStageImage(runtime.imageAdjustSession.stageKey, runtime.imageAdjustSession.image);
  await syncFromServer({ allowFallbackNotice: false, competitionId: runtime.selectedCompetitionId });
  closeImageAdjustDialog();
  notify("Bildutsnittet är sparat.");
}

function renderCompetitionSelector() {
  const history = context && Array.isArray(context.competitionHistory) ? context.competitionHistory : [];
  const selectedCompetition = context && context.selectedCompetition ? context.selectedCompetition : null;

  renderSelectOptions(
    dom.competitionSelect,
    history.map((competition) => ({
      value: competition.id,
      label: competition.eventName || `Tävling ${competition.year}`,
    })),
    selectedCompetition ? selectedCompetition.id : "",
  );

  dom.competitionSelect.disabled = !history.length;

  if (!selectedCompetition) {
    dom.competitionCopy.textContent = "Kunde inte läsa in tävlingshistoriken.";
    return;
  }

  dom.competitionCopy.textContent = selectedCompetition.isActive
    ? "Visar den aktiva tävlingen som deltagarna tävlar i just nu."
    : `Visar sparade resultat från ${selectedCompetition.eventName}.`;
}

function renderRulesDialog() {
  const selectedCompetition = context && context.selectedCompetition ? context.selectedCompetition : null;
  const competitionName = selectedCompetition && selectedCompetition.eventName ? selectedCompetition.eventName : "TÃ¤vlingen";
  const rulesText =
    selectedCompetition && typeof selectedCompetition.eventRules === "string" ? selectedCompetition.eventRules.trim() : "";

  if (dom.rulesTitle instanceof HTMLElement) {
    dom.rulesTitle.textContent = `Regler fÃ¶r ${competitionName}`;
  }

  if (dom.rulesCopy instanceof HTMLElement) {
    dom.rulesCopy.textContent = rulesText || "Inga regler Ã¤r inlagda fÃ¶r den hÃ¤r tÃ¤vlingen Ã¤nnu.";
    dom.rulesCopy.classList.toggle("is-empty", !rulesText);
  }
}

function renderStandings() {
  if (!context || !Array.isArray(context.standings) || !context.standings.length) {
    dom.standingsList.innerHTML = '<div class="display-empty">Inga placeringar är registrerade än.</div>';
    return;
  }

  dom.standingsList.innerHTML = context.standings
    .map((entry) => {
      const weightText = entry.hasWeight ? formatWeight(entry.weightKg) : "Ingen vikt än";
      const rankText = entry.rank ? String(entry.rank) : "-";
      return `
        <div class="participant-standings-row${entry.isSelf ? " is-self" : ""}">
          <div class="participant-standings-row__rank">${escapeHtml(rankText)}</div>
          <div class="participant-standings-row__copy">
            <strong>${escapeHtml(entry.name)}</strong>
            <span>${escapeHtml(entry.team || "Ingen avdelning")}</span>
          </div>
          <div class="participant-standings-row__weight">${escapeHtml(weightText)}</div>
        </div>
      `;
    })
    .join("");
}

async function storeParticipantStageImage(file, participantId, stageKey) {
  const dataUrl = await readFileAsDataUrl(file);
  const response = await fetch("/api/upload-image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ participantId, stageKey, dataUrl }),
  });

  if (response.status === 401) {
    redirectToLogin();
    throw new Error("Unauthorized");
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `Status ${response.status}`);
  }

  return sanitizeImagePath(payload.path);
}

async function persistParticipantStageImage(stageKey, imageValue) {
  const response = await fetch("/api/participant-image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ stageKey, image: normalizeParticipantImage(imageValue) }),
  });

  if (response.status === 401) {
    redirectToLogin();
    throw new Error("Unauthorized");
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `Status ${response.status}`);
  }

  return payload;
}

async function persistParticipantPasswordChange(currentPassword, newPassword) {
  const response = await fetch("/api/participant-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ currentPassword, newPassword }),
  });

  if (response.status === 401) {
    redirectToLogin();
    throw new Error("Unauthorized");
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `Status ${response.status}`);
  }

  return payload;
}

async function logoutSession() {
  try {
    await fetch("/api/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
  } catch {}
}

function redirectToLogin() {
  const nextPath = `${window.location.pathname}${window.location.search}`;
  window.location.assign(`/login?next=${encodeURIComponent(nextPath)}`);
}

function setSyncMode(mode) {
  runtime.syncMode = mode;
  dom.syncStatus.classList.remove("is-local", "is-warning");
  if (mode === "server") {
    dom.syncStatus.textContent = "Ansluten";
    return;
  }
  if (mode === "warning") {
    dom.syncStatus.classList.add("is-warning");
    dom.syncStatus.textContent = "Kunde inte nå servern";
    return;
  }
  dom.syncStatus.classList.add("is-local");
  dom.syncStatus.textContent = "Kör lokalt i webbläsaren";
}

function notify(message) {
  dom.notice.textContent = message;
  dom.notice.classList.add("is-visible");
  window.clearTimeout(runtime.noticeHandle);
  runtime.noticeHandle = window.setTimeout(() => {
    dom.notice.textContent = "";
    dom.notice.classList.remove("is-visible");
  }, 4200);
}

function normalizeParticipantContext(rawContext) {
  const input = rawContext && typeof rawContext === "object" ? rawContext : {};
  const participant = input.participant && typeof input.participant === "object" ? input.participant : {};
  const standings = Array.isArray(input.standings) ? input.standings : [];
  const competitionHistory = Array.isArray(input.competitionHistory)
    ? input.competitionHistory
        .map((competition) => ({
          id: sanitizeId(competition && competition.id),
          year: sanitizeYear(competition && competition.year),
          eventName: sanitizeText(competition && competition.eventName, 120),
          eventSubtitle: sanitizeText(competition && competition.eventSubtitle, 140),
          participantCount: sanitizeCount(competition && competition.participantCount),
          weighedCount: sanitizeCount(competition && competition.weighedCount),
          weighInCount: sanitizeCount(competition && competition.weighInCount),
          isActive: Boolean(competition && competition.isActive),
          updatedAt: sanitizeTimestamp(competition && competition.updatedAt) || "",
        }))
        .filter((competition) => competition.id)
    : [];
  const selectedCompetitionInput =
    input.selectedCompetition && typeof input.selectedCompetition === "object" ? input.selectedCompetition : {};

  return {
    eventName: sanitizeText(input.eventName, 120) || "Odlingskampen",
    eventSubtitle: sanitizeText(input.eventSubtitle, 140),
    eventRules: sanitizeText(input.eventRules, 4000),
    activeCompetitionId: sanitizeId(input.activeCompetitionId),
    selectedCompetitionId: sanitizeId(input.selectedCompetitionId),
    competitionHistory,
    selectedCompetition: {
      id: sanitizeId(selectedCompetitionInput.id) || sanitizeId(input.selectedCompetitionId) || sanitizeId(input.activeCompetitionId),
      year: sanitizeYear(selectedCompetitionInput.year),
      eventName: sanitizeText(selectedCompetitionInput.eventName, 120),
      eventSubtitle: sanitizeText(selectedCompetitionInput.eventSubtitle, 140),
      eventRules: sanitizeText(selectedCompetitionInput.eventRules, 4000),
      isActive: Boolean(selectedCompetitionInput.isActive),
      updatedAt: sanitizeTimestamp(selectedCompetitionInput.updatedAt) || "",
    },
    participant: {
      id: sanitizeId(participant.id),
      name: sanitizeText(participant.name, 80),
      team: sanitizeText(participant.team, 80),
      username: sanitizeText(participant.username, 80),
      images: normalizeParticipantImages(participant.images),
      weightKg: sanitizeWeight(participant.weightKg),
      rank: sanitizeRank(participant.rank),
      measuredAt: sanitizeTimestamp(participant.measuredAt),
    },
    standings: standings.map((entry) => ({
      id: sanitizeId(entry.id),
      rank: sanitizeRank(entry.rank),
      name: sanitizeText(entry.name, 80),
      team: sanitizeText(entry.team, 80),
      weightKg: sanitizeWeight(entry.weightKg),
      hasWeight: Boolean(entry.hasWeight),
      isSelf: Boolean(entry.isSelf),
      measuredAt: sanitizeTimestamp(entry.measuredAt),
    })),
  };
}

function createEmptyParticipantImages() {
  return {
    sprout: createParticipantImage(),
    flower: createParticipantImage(),
    harvest: createParticipantImage(),
  };
}

function startImageAdjustDrag(event) {
  if (!(dom.imageAdjustWorkspaceShell instanceof HTMLElement) || !runtime.imageAdjustSession) {
    return;
  }

  if (event.pointerType === "mouse" && event.button !== 0) {
    return;
  }

  const image = normalizeParticipantImage(runtime.imageAdjustSession.image);
  if (!image.path) {
    return;
  }

  const rect = dom.imageAdjustWorkspaceShell.getBoundingClientRect();
  runtime.imageAdjustSession = {
    ...runtime.imageAdjustSession,
    drag: {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startOffsetX: image.positionX,
      startOffsetY: image.positionY,
      width: rect.width || 1,
      height: rect.height || 1,
    },
  };

  setImageAdjustDragging(true);
  dom.imageAdjustWorkspaceShell.setPointerCapture?.(event.pointerId);
  event.preventDefault();
}

function moveImageAdjustDrag(event) {
  const drag = runtime.imageAdjustSession && runtime.imageAdjustSession.drag;
  if (!drag || event.pointerId !== drag.pointerId || !runtime.imageAdjustSession) {
    return;
  }

  const deltaX = ((event.clientX - drag.startX) / drag.width) * 100;
  const deltaY = ((event.clientY - drag.startY) / drag.height) * 100;
  const nextImage = createParticipantImage(
    runtime.imageAdjustSession.image.path,
    drag.startOffsetX + deltaX,
    drag.startOffsetY + deltaY,
    runtime.imageAdjustSession.image.scale,
  );

  updateImageAdjustSessionImage(nextImage);
  event.preventDefault();
}

function endImageAdjustDrag(event) {
  const drag = runtime.imageAdjustSession && runtime.imageAdjustSession.drag;
  if (!drag || event.pointerId !== drag.pointerId || !runtime.imageAdjustSession) {
    return;
  }

  if (dom.imageAdjustWorkspaceShell instanceof HTMLElement) {
    dom.imageAdjustWorkspaceShell.releasePointerCapture?.(event.pointerId);
  }

  runtime.imageAdjustSession = {
    ...runtime.imageAdjustSession,
    drag: null,
  };
  setImageAdjustDragging(false);
}

function updateImageAdjustSessionImage(imageValue) {
  if (!runtime.imageAdjustSession) {
    return;
  }

  const nextImage = normalizeParticipantImage(imageValue);
  runtime.imageAdjustSession = {
    ...runtime.imageAdjustSession,
    image: nextImage,
  };
  syncImageAdjustControls(nextImage);
  renderImageAdjustPreview(nextImage, context && context.participant ? context.participant.name : "", getStageLabel(runtime.imageAdjustSession.stageKey));
}

function setImageAdjustDragging(isDragging) {
  if (!(dom.imageAdjustWorkspaceShell instanceof HTMLElement)) {
    return;
  }

  dom.imageAdjustWorkspaceShell.classList.toggle("is-dragging", Boolean(isDragging));
}

function sanitizeImageOffset(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(35, Math.max(-35, Math.round(parsed * 100) / 100)) : fallback;
}

function sanitizeImageScale(value, fallback = 1) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(2.5, Math.max(1, Math.round(parsed * 100) / 100)) : fallback;
}

function createParticipantImage(path = "", positionX = 0, positionY = 0, scale = 1) {
  return {
    path: sanitizeImagePath(path),
    positionX: sanitizeImageOffset(positionX),
    positionY: sanitizeImageOffset(positionY),
    scale: sanitizeImageScale(scale),
  };
}

function normalizeParticipantImage(rawImage) {
  if (typeof rawImage === "string") {
    return createParticipantImage(rawImage);
  }

  if (!rawImage || typeof rawImage !== "object") {
    return createParticipantImage();
  }

  return createParticipantImage(rawImage.path, rawImage.positionX, rawImage.positionY, rawImage.scale);
}

function normalizeParticipantImages(rawImages) {
  const images = rawImages && typeof rawImages === "object" ? rawImages : {};
  return {
    sprout: normalizeParticipantImage(images.sprout),
    flower: normalizeParticipantImage(images.flower),
    harvest: normalizeParticipantImage(images.harvest),
  };
}

function applyParticipantImageStyle(element, rawImage) {
  if (!(element instanceof HTMLElement)) {
    return;
  }

  const image = normalizeParticipantImage(rawImage);
  element.style.setProperty("--image-offset-x", `${image.positionX}%`);
  element.style.setProperty("--image-offset-y", `${image.positionY}%`);
  element.style.setProperty("--image-scale", String(image.scale));
}

function getStageLabel(stageKey) {
  return PARTICIPANT_IMAGE_STAGES.find((stage) => stage.key === stageKey)?.label || "Steget";
}

function formatWeight(weightKg) {
  return `${Number(weightKg).toFixed(3).replace(".", ",")} kg`;
}

function formatDateTime(value) {
  return dateTimeFormatter.format(new Date(value));
}

function sanitizeWeight(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 999.999 ? Math.round(parsed * 1000) / 1000 : null;
}

function sanitizeRank(value) {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function sanitizeCount(value) {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function sanitizeYear(value, fallback = new Date().getFullYear()) {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? Math.min(2100, Math.max(2000, parsed)) : fallback;
}

function sanitizeText(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function sanitizeId(value) {
  return typeof value === "string" ? value.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40) : "";
}

function sanitizeTimestamp(value) {
  const parsedDate = new Date(typeof value === "string" ? value.trim() : "");
  return Number.isNaN(parsedDate.getTime()) ? "" : parsedDate.toISOString();
}

function sanitizeImagePath(value) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("data:image/")) return trimmed;
  if (trimmed.startsWith("/uploads/")) return trimmed;
  if (trimmed.startsWith("uploads/")) return `/${trimmed}`;
  return "";
}

function renderSelectOptions(select, options, selectedValue) {
  select.innerHTML = options.length
    ? options
        .map(
          (option) =>
            `<option value="${escapeHtml(option.value)}"${option.value === selectedValue ? " selected" : ""}>${escapeHtml(option.label)}</option>`,
        )
        .join("")
    : '<option value="">Inga val tillgängliga</option>';
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Kunde inte läsa filen."));
    reader.readAsDataURL(file);
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
