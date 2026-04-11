const STORAGE_KEY = "odlingskampen-state-v2";
const CHANNEL_NAME = "odlingskampen-live";
const NEW_PARTICIPANT_VALUE = "__new__";
const DEFAULT_PARTICIPANT_PASSWORD = "Odlingskampen";
const VALID_VIEWS = new Set(["settings", "operator", "measurement", "presenter", "board"]);
const CURRENT_VIEW = getCurrentView();
const DISPLAY_VIEW = CURRENT_VIEW === "board";
const POLL_INTERVAL_MS = DISPLAY_VIEW ? 1500 : 3500;
const SCOREBOARD_MOVE_DURATION_MS = 1800;
const SCOREBOARD_ENTER_DURATION_MS = 900;
const SCOREBOARD_REGISTER_HIGHLIGHT_MS = 2600;
const SCOREBOARD_PROMOTION_HIGHLIGHT_MS = 2800;
const SCOREBOARD_SEQUENCE_COUNTUP_MS = 7800;
const SCOREBOARD_SEQUENCE_RESULT_HOLD_MS = 2000;
const SCOREBOARD_SEQUENCE_SCROLL_MS = 1050;
const SCOREBOARD_SEQUENCE_LAND_MS = 820;
const SCOREBOARD_SEQUENCE_FOCUS_MS = 3000;
const SCOREBOARD_SEQUENCE_RETURN_MS = 1100;
const WEIGH_IN_SHOWCASE_STALE_COUNTUP_MS = 45000;
const SPOTLIGHT_REFRESH_MS = 1000;
const WEIGH_IN_SHOWCASE_PHASES = {
  IDLE: "idle",
  INTRO: "intro",
  COUNTUP: "countup",
};

const PARTICIPANT_IMAGE_STAGES = [
  { key: "sprout", label: "Första planta", emptyLabel: "Ingen bild för den första plantan än." },
  { key: "flower", label: "Första blomman", emptyLabel: "Ingen bild för pollinerad blomma än." },
  { key: "harvest", label: "Skördad frukt", emptyLabel: "Ingen bild på skördad frukt än." },
];

const PAGE_META = {
  settings: {
    title: "Admin",
    subtitle: "",
  },
  operator: {
    title: "Admin",
    subtitle: "",
  },
  measurement: {
    title: "Admin",
    subtitle: "",
  },
  presenter: {
    title: "Admin",
    subtitle: "",
  },
};

const VIEW_LABELS = {
  settings: "Inställningar",
  operator: "Deltagare",
  measurement: "Mätning",
  presenter: "Presentation",
};

const dateTimeFormatter = new Intl.DateTimeFormat("sv-SE", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const dom = {};
const runtime = {
  selectedParticipantId: "",
  noticeHandle: null,
  pollHandle: null,
  spotlightHandle: null,
  channel: null,
  syncMode: "starting",
  lastSpotlightSignature: "",
  lastSpotlightGallerySignature: "",
  boardSequenceArmed: false,
  boardSequenceRunId: 0,
  boardListOffsetY: 0,
  boardListAnimation: null,
  boardCardAnimation: null,
  boardWeightFrameHandle: 0,
  lastBoardShowcaseSignature: "",
  lastBoardSequenceGallerySignature: "",
  lastBoardSequenceToken: "",
  completedBoardShowcaseSignature: "",
  lastConsumedBoardShowcaseToken: "",
  imageAdjustSession: null,
  participantSearchQuery: "",
  measurementSearchQuery: "",
};

let state = createDefaultState();
let standings = getStandings(state);

document.addEventListener("DOMContentLoaded", () => {
  cacheDom();
  configureLayout();
  state = loadCachedState();
  standings = getStandings(state);
  ensureRuntimeSelections();
  bindEvents();
  setupLocalSync();
  render(true);
  loadInitialState().finally(() => {
    armBoardSequence();
  });
  startPolling();
  startSpotlightTicker();
});

function getCurrentView() {
  const rawView = new URLSearchParams(window.location.search).get("view") || "operator";
  return VALID_VIEWS.has(rawView) ? rawView : "operator";
}

function cacheDom() {
  dom.workbenchShell = document.getElementById("workbench-shell");
  dom.displayShell = document.getElementById("display-shell");
  dom.pageTitle = document.getElementById("page-title");
  dom.topbarCurrentView = document.getElementById("topbar-current-view");
  dom.pageSubtitle = document.getElementById("page-subtitle");
  dom.navLinks = Array.from(document.querySelectorAll("[data-nav-view]"));
  dom.menuToggleButton = document.getElementById("menu-toggle-btn");
  dom.topbarMenu = document.getElementById("mobile-topbar-menu");
  dom.syncStatus = document.getElementById("sync-status");
  dom.logoutButton = document.getElementById("logout-btn");
  dom.globalNotice = document.getElementById("global-notice");
  dom.viewPages = new Map([
    ["settings", document.getElementById("settings-view")],
    ["operator", document.getElementById("operator-view")],
    ["measurement", document.getElementById("measurement-view")],
    ["presenter", document.getElementById("presenter-view")],
  ]);

  dom.eventForm = document.getElementById("event-form");
  dom.eventName = document.getElementById("event-name");
  dom.eventSubtitle = document.getElementById("event-subtitle");
  dom.eventRules = document.getElementById("event-rules");
  dom.loadDemoButton = document.getElementById("load-demo-btn");
  dom.resetButton = document.getElementById("reset-btn");
  dom.summaryTotal = document.getElementById("summary-total");
  dom.summaryWeighed = document.getElementById("summary-weighed");
  dom.summaryRemaining = document.getElementById("summary-remaining");
  dom.summaryLeader = document.getElementById("summary-leader");
  dom.settingsPresentationMode = document.getElementById("settings-presentation-mode");
  dom.settingsPresentationCopy = document.getElementById("settings-presentation-copy");
  dom.settingsActiveCompetition = document.getElementById("settings-active-competition");
  dom.competitionCreateButton = document.getElementById("competition-create-btn");
  dom.competitionHistoryList = document.getElementById("competition-history-list");

  dom.participantOpenCreateButton = document.getElementById("participant-open-create-btn");
  dom.participantSearch = document.getElementById("participant-search");
  dom.participantSearchSummary = document.getElementById("participant-search-summary");
  dom.participantSelect = document.getElementById("participant-select");
  dom.participantForm = document.getElementById("participant-form");
  dom.participantName = document.getElementById("participant-name");
  dom.participantTeam = document.getElementById("participant-team");
  dom.participantUsernamePreview = document.getElementById("participant-username-preview");
  dom.participantUsernameHint = document.getElementById("participant-username-hint");
  dom.participantPassword = document.getElementById("participant-password");
  dom.participantSaveButton = document.getElementById("participant-save-btn");
  dom.participantDeleteButton = document.getElementById("participant-delete-btn");
  dom.participantCreateDialog = document.getElementById("participant-create-dialog");
  dom.participantCreateForm = document.getElementById("participant-create-form");
  dom.participantCreateName = document.getElementById("participant-create-name");
  dom.participantCreateTeam = document.getElementById("participant-create-team");
  dom.participantCreateCancelButton = document.getElementById("participant-create-cancel-btn");
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

  dom.weighInForm = document.getElementById("weigh-in-form");
  dom.measurementParticipantSearch = document.getElementById("measurement-participant-search");
  dom.measurementParticipantSearchSummary = document.getElementById("measurement-participant-search-summary");
  dom.measurementParticipantSelect = document.getElementById("measurement-participant-select");
  dom.weighPanelTitle = document.getElementById("weigh-panel-title");
  dom.weighPanelCopy = document.getElementById("weigh-panel-copy");
  dom.participantCurrentWeight = document.getElementById("participant-current-weight");
  dom.participantCurrentRank = document.getElementById("participant-current-rank");
  dom.participantCurrentMeasuredAt = document.getElementById("participant-current-measured-at");
  dom.participantCurrentStatus = document.getElementById("participant-current-status");
  dom.weighSequenceNote = document.getElementById("weigh-sequence-note");
  dom.weighStartButton = document.getElementById("weigh-start-btn");
  dom.weighWeight = document.getElementById("weigh-weight");
  dom.weighSaveButton = document.getElementById("weigh-save-btn");
  dom.weighDeleteButton = document.getElementById("weigh-delete-btn");

  dom.presentModeBoard = document.getElementById("present-mode-board");
  dom.presentModeSpotlight = document.getElementById("present-mode-spotlight");
  dom.presentParticipant = document.getElementById("present-participant");
  dom.presentInterval = document.getElementById("present-interval");
  dom.presentPrevButton = document.getElementById("present-prev-btn");
  dom.presentNextButton = document.getElementById("present-next-btn");
  dom.presentAutoplayButton = document.getElementById("present-autoplay-btn");
  dom.presentOpenDisplayButton = document.getElementById("present-open-display-btn");
  dom.presentCurrentMode = document.getElementById("present-current-mode");
  dom.presentCurrentParticipant = document.getElementById("present-current-participant");
  dom.presentCurrentAutoplay = document.getElementById("present-current-autoplay");
  dom.presentCurrentScreen = document.getElementById("present-current-screen");
  dom.presentCurrentCopy = document.getElementById("present-current-copy");

  dom.displayBoard = document.getElementById("display-board");
  dom.displayBoardFrame = document.getElementById("display-board-frame");
  dom.displaySpotlight = document.getElementById("display-spotlight");
  dom.displayEventName = document.getElementById("display-event-name");
  dom.displayEventSubtitle = document.getElementById("display-event-subtitle");
  dom.scoreboardList = document.getElementById("scoreboard-list");
  dom.boardSequenceLayer = document.getElementById("board-sequence-layer");
  dom.boardSequenceCard = document.getElementById("board-sequence-card");
  dom.boardSequenceRank = document.getElementById("board-sequence-rank");
  dom.boardSequenceName = document.getElementById("board-sequence-name");
  dom.boardSequenceTeam = document.getElementById("board-sequence-team");
  dom.boardSequenceMovement = document.getElementById("board-sequence-movement");
  dom.boardSequenceGallery = document.getElementById("board-sequence-gallery");
  dom.boardSequenceWeight = document.getElementById("board-sequence-weight");
  dom.boardSequenceWeightValue = document.getElementById("board-sequence-weight-value");
  dom.boardSequenceWeightUnit = document.getElementById("board-sequence-weight-unit");
  dom.spotlightEventName = document.getElementById("spotlight-event-name");
  dom.spotlightEventSubtitle = document.getElementById("spotlight-event-subtitle");
  dom.spotlightCard = document.getElementById("spotlight-card");
  dom.spotlightRank = document.getElementById("spotlight-rank");
  dom.spotlightName = document.getElementById("spotlight-name");
  dom.spotlightTeam = document.getElementById("spotlight-team");
  dom.spotlightWeight = document.getElementById("spotlight-weight");
  dom.spotlightGallery = document.getElementById("spotlight-gallery");
  dom.imageAdjustDialog = document.getElementById("image-adjust-dialog");
  dom.imageAdjustTitle = document.getElementById("image-adjust-title");
  dom.imageAdjustCopy = document.getElementById("image-adjust-copy");
  dom.imageAdjustPreview = document.getElementById("image-adjust-preview");
  dom.imageAdjustResultPreview = document.getElementById("image-adjust-result-preview");
  dom.imageAdjustEmpty = document.getElementById("image-adjust-empty");
  dom.imageAdjustScale = document.getElementById("image-adjust-scale");
  dom.imageAdjustOffsetX = document.getElementById("image-adjust-offset-x");
  dom.imageAdjustOffsetY = document.getElementById("image-adjust-offset-y");
  dom.imageAdjustCancelButton = document.getElementById("image-adjust-cancel-btn");
  dom.imageAdjustSaveButton = document.getElementById("image-adjust-save-btn");
}

function configureLayout() {
  document.body.dataset.view = CURRENT_VIEW;
  dom.workbenchShell.hidden = DISPLAY_VIEW;
  dom.displayShell.hidden = !DISPLAY_VIEW;

  dom.viewPages.forEach((page, key) => {
    page.hidden = CURRENT_VIEW !== key;
  });

  dom.navLinks.forEach((link) => {
    const isActive = link.dataset.navView === CURRENT_VIEW;
    link.classList.toggle("is-active", isActive);
    link.setAttribute("aria-current", isActive ? "page" : "false");
  });

  if (dom.topbarCurrentView instanceof HTMLElement) {
    dom.topbarCurrentView.textContent = VIEW_LABELS[CURRENT_VIEW] || "";
  }

  if (!DISPLAY_VIEW) {
    const meta = PAGE_META[CURRENT_VIEW] || PAGE_META.operator;
    dom.pageTitle.textContent = meta.title;
    dom.pageSubtitle.textContent = meta.subtitle;
    dom.pageSubtitle.hidden = !meta.subtitle;
  }
}

function setMobileMenuOpen(isOpen) {
  if (!(dom.menuToggleButton instanceof HTMLButtonElement) || !(dom.topbarMenu instanceof HTMLElement)) {
    return;
  }

  dom.menuToggleButton.setAttribute("aria-expanded", String(isOpen));
  dom.topbarMenu.classList.toggle("is-open", isOpen);
}

function bindEvents() {
  if (dom.logoutButton) {
    dom.logoutButton.addEventListener("click", async () => {
      await logoutSession();
      redirectToLogin();
    });
  }

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

  dom.navLinks.forEach((link) => {
    link.addEventListener("click", () => {
      setMobileMenuOpen(false);
    });
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 900) {
      setMobileMenuOpen(false);
    }
  });

  dom.eventForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await persistState({
      ...state,
      eventName: sanitizeText(dom.eventName.value, 120) || createDefaultState().eventName,
      eventSubtitle: sanitizeText(dom.eventSubtitle.value, 140) || createDefaultState().eventSubtitle,
      eventRules: sanitizeText(dom.eventRules.value, 4000),
    });
    notify("Tävlingsinställningarna är sparade.");
  });

  dom.loadDemoButton.addEventListener("click", async () => {
    if (!window.confirm("Det här ersätter nuvarande data med exempeldata. Fortsätta?")) {
      return;
    }
    runtime.selectedParticipantId = "";
    await persistState(buildDemoState());
    notify("Demodata är laddad.");
  });

  dom.resetButton.addEventListener("click", async () => {
    if (!window.confirm("Detta tar bort alla deltagare, bilder och invägningar. Är du säker?")) {
      return;
    }
    runtime.selectedParticipantId = NEW_PARTICIPANT_VALUE;
    await persistState(createDefaultState());
    dom.weighWeight.value = "";
    notify("Tävlingen är nollställd.");
  });

  dom.competitionCreateButton.addEventListener("click", async () => {
    if (!window.confirm("Det här startar en ny tävling för nästa år och behåller nuvarande tävling som historik. Fortsätta?")) {
      return;
    }

    try {
      await createNextCompetition();
      runtime.selectedParticipantId = NEW_PARTICIPANT_VALUE;
      dom.weighWeight.value = "";
      render(true);
      notify("En ny tävling är skapad och aktiverad.");
    } catch (error) {
      console.warn("Kunde inte skapa nästa tävling.", error);
      notify(error instanceof Error ? error.message : "Det gick inte att skapa nästa tävling.");
    }
  });

  dom.competitionHistoryList.addEventListener("click", async (event) => {
    const activateButton = event.target.closest("[data-competition-activate]");
    const deleteButton = event.target.closest("[data-competition-delete]");

    if (deleteButton) {
      const competitionId = sanitizeId(deleteButton.dataset.competitionDelete);
      if (!competitionId) {
        return;
      }

      const competition = (state.competitionHistory || []).find((entry) => entry.id === competitionId);
      const competitionLabel = competition?.eventName || `Tävling ${competition?.year || ""}`;
      if (!window.confirm(`Ta bort ${competitionLabel} permanent? Detta går inte att ångra.`)) {
        return;
      }

      try {
        await deleteCompetition(competitionId);
        runtime.selectedParticipantId = NEW_PARTICIPANT_VALUE;
        dom.weighWeight.value = "";
        render(true);
        notify("Tävlingen är borttagen.");
      } catch (error) {
        console.warn("Kunde inte ta bort tävlingen.", error);
        notify(error instanceof Error ? error.message : "Det gick inte att ta bort tävlingen.");
      }
      return;
    }

    if (!activateButton) {
      return;
    }

    const competitionId = sanitizeId(activateButton.dataset.competitionActivate);
    if (!competitionId || competitionId === state.activeCompetitionId) {
      return;
    }

    if (!window.confirm("Byt aktiv tävling? Appen och presentationsskärmen kommer då att arbeta med den valda tävlingen.")) {
      return;
    }

    try {
      await activateCompetition(competitionId);
      runtime.selectedParticipantId = NEW_PARTICIPANT_VALUE;
      dom.weighWeight.value = "";
      render(true);
      notify("Den valda tävlingen är nu aktiv.");
    } catch (error) {
      console.warn("Kunde inte aktivera tävlingen.", error);
      notify(error instanceof Error ? error.message : "Det gick inte att aktivera tävlingen.");
    }
  });

  dom.participantSelect.addEventListener("change", () => {
    runtime.selectedParticipantId = sanitizeId(dom.participantSelect.value) || NEW_PARTICIPANT_VALUE;
    dom.participantPassword.value = "";
    render();
  });

  dom.participantSearch.addEventListener("input", () => {
    runtime.participantSearchQuery = sanitizeText(dom.participantSearch.value, 80);
    render();
  });

  dom.measurementParticipantSearch.addEventListener("input", () => {
    runtime.measurementSearchQuery = sanitizeText(dom.measurementParticipantSearch.value, 80);
    render();
  });

  dom.measurementParticipantSelect.addEventListener("change", () => {
    runtime.selectedParticipantId = sanitizeId(dom.measurementParticipantSelect.value) || NEW_PARTICIPANT_VALUE;
    render();
  });

  dom.participantName.addEventListener("input", () => {
    renderParticipantLoginFields();
  });

  dom.participantOpenCreateButton.addEventListener("click", () => {
    openParticipantCreateDialog();
  });

  dom.participantCreateCancelButton.addEventListener("click", () => {
    closeParticipantCreateDialog();
  });

  dom.participantCreateDialog.addEventListener("close", () => {
    dom.participantCreateForm.reset();
  });

  dom.participantCreateForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const name = sanitizeText(dom.participantCreateName.value, 80);
    const team = sanitizeText(dom.participantCreateTeam.value, 80);

    if (!name) {
      notify("Skriv in namn och efternamn innan du lägger till deltagaren.");
      return;
    }

    const duplicate = findDuplicateParticipant(name, team);

    if (duplicate) {
      notify("En deltagare med samma namn och lag finns redan.");
      return;
    }

    const participantId = createId("p");
    runtime.selectedParticipantId = participantId;
    await persistState({
      ...state,
      participants: [...state.participants, { id: participantId, name, team, images: createEmptyParticipantImages() }],
    });
    closeParticipantCreateDialog();
    try {
      await persistParticipantPassword(participantId, DEFAULT_PARTICIPANT_PASSWORD);
      notify(`Ny deltagare är sparad. Standardlösenord: ${DEFAULT_PARTICIPANT_PASSWORD}.`);
    } catch (error) {
      console.warn("Kunde inte sätta standardlösenord för ny deltagare.", error);
      notify("Ny deltagare är sparad, men standardlösenordet kunde inte sättas automatiskt.");
    }
    dom.participantName.focus();
  });

  dom.participantForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const name = sanitizeText(dom.participantName.value, 80);
    const team = sanitizeText(dom.participantTeam.value, 80);
    const participantPassword = dom.participantPassword.value;
    const selectedParticipant = getSelectedParticipant();

    if (!selectedParticipant) {
      notify("Välj en deltagare i listan innan du sparar ändringarna.");
      return;
    }

    if (!name) {
      notify("Skriv in ett namn innan du sparar deltagaren.");
      return;
    }

    const duplicate = findDuplicateParticipant(name, team, selectedParticipant.id);

    if (duplicate) {
      notify("En deltagare med samma namn och lag finns redan.");
      return;
    }

    runtime.selectedParticipantId = selectedParticipant.id;
    await persistState({
      ...state,
      participants: state.participants.map((participant) =>
        participant.id === selectedParticipant.id ? { ...participant, name, team } : participant,
      ),
    });
    if (participantPassword.trim()) {
      try {
        await persistParticipantPassword(selectedParticipant.id, participantPassword.trim());
        dom.participantPassword.value = "";
        notify("Deltagaren och lösenordet är uppdaterade.");
      } catch (error) {
        console.warn("Kunde inte spara deltagarlösenordet.", error);
        notify(error instanceof Error ? error.message : "Deltagarlösenordet kunde inte sparas.");
      }
      return;
    }
    notify("Deltagaren är uppdaterad.");
  });

  dom.participantDeleteButton.addEventListener("click", async () => {
    const selectedParticipant = getSelectedParticipant();
    if (!selectedParticipant) {
      notify("Välj en deltagare att ta bort.");
      return;
    }

    if (!window.confirm(`Ta bort ${selectedParticipant.name} och alla tillhörande invägningar?`)) {
      return;
    }

    runtime.selectedParticipantId = NEW_PARTICIPANT_VALUE;
    await persistState(removeParticipant(state, selectedParticipant.id));
    dom.weighWeight.value = "";
    notify(`${selectedParticipant.name} är borttagen.`);
  });

  dom.stageInputs.forEach((input, stageKey) => {
    input.addEventListener("change", async (event) => {
      const participant = getSelectedParticipant();
      const fileList = event.target.files;
      const file = fileList && fileList.length ? fileList[0] : null;
      event.target.value = "";

      if (!participant) {
        notify("Spara deltagaren innan du laddar upp bilder.");
        return;
      }

      if (!file) {
        return;
      }

      try {
        notify(`Laddar upp bild för ${participant.name}...`);
        const imagePath = await storeParticipantStageImage(file, participant.id, stageKey);
        const nextImage = createParticipantImage(imagePath);
        await persistState(updateParticipantImage(state, participant.id, stageKey, nextImage));
        openImageAdjustDialog(participant.id, stageKey, nextImage);
        notify(`Bild sparad för ${participant.name}. Justera utsnittet vid behov.`);
      } catch (error) {
        console.warn("Bilduppladdningen misslyckades.", error);
        notify("Det gick inte att spara bilden.");
      }
    });
  });

  dom.stageRemoveButtons.forEach((button, stageKey) => {
    button.addEventListener("click", async () => {
      const participant = getSelectedParticipant();
      if (!participant) {
        notify("Välj en sparad deltagare för att ta bort bild.");
        return;
      }

      if (!hasParticipantImage(participant.images && participant.images[stageKey])) {
        notify("Det finns ingen bild att ta bort för det steget.");
        return;
      }

      await persistState(updateParticipantImage(state, participant.id, stageKey, createParticipantImage()));
      notify(`Bilden för ${participant.name} är borttagen.`);
    });
  });

  dom.stageAdjustButtons.forEach((button, stageKey) => {
    button.addEventListener("click", () => {
      const participant = getSelectedParticipant();
      if (!participant) {
        notify("Välj en deltagare innan du justerar bilden.");
        return;
      }

      const image = normalizeParticipantImage(participant.images && participant.images[stageKey]);
      if (!image.path) {
        notify("Ladda upp en bild innan du justerar utsnittet.");
        return;
      }

      openImageAdjustDialog(participant.id, stageKey, image);
    });
  });

  dom.weighStartButton.addEventListener("click", async () => {
    const selectedParticipant = getSelectedParticipant();

    if (!selectedParticipant) {
      notify("Välj en deltagare innan du startar invägningen.");
      return;
    }

    const nextState = startParticipantWeighInShowcase(state, selectedParticipant.id);
    await persistState(nextState);
    notify(`${selectedParticipant.name} visas nu på presentationsskärmen. Mata in vikten när ni är redo.`);
    dom.weighWeight.focus();
    dom.weighWeight.select();
  });

  dom.weighInForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const selectedParticipant = getSelectedParticipant();
    const participantId = selectedParticipant ? selectedParticipant.id : "";
    const weightKg = normalizeWeightInput(dom.weighWeight.value);
    const weighInShowcase = getActiveWeighInShowcase(state.presentation);

    if (!participantId || !selectedParticipant) {
      notify("Välj en deltagare innan du registrerar vikt.");
      return;
    }

    if (
      weighInShowcase.phase !== WEIGH_IN_SHOWCASE_PHASES.INTRO ||
      weighInShowcase.participantId !== participantId
    ) {
      notify("Tryck Starta för att visa deltagaren på presentationsskärmen innan du uppdaterar vikten.");
      return;
    }

    if (weightKg === null) {
      notify("Skriv in en giltig vikt i kilo.");
      return;
    }

    const existingWeighIn = getParticipantWeighIn(participantId);
    await persistState(commitParticipantWeighInShowcase(state, participantId, weightKg));
    notify(
      existingWeighIn
        ? `Vikten för ${selectedParticipant.name} är uppdaterad till ${formatWeight(weightKg)}.`
        : `${selectedParticipant.name} registrerades på ${formatWeight(weightKg)}.`,
    );
  });

  dom.weighDeleteButton.addEventListener("click", async () => {
    const selectedParticipant = getSelectedParticipant();
    if (!selectedParticipant) {
      notify("Välj en deltagare innan du tar bort en vikt.");
      return;
    }

    const weighIn = getParticipantWeighIn(selectedParticipant.id);
    if (!weighIn) {
      notify("Den valda deltagaren har ingen registrerad vikt.");
      return;
    }

    if (!window.confirm(`Ta bort den registrerade vikten för ${selectedParticipant.name}?`)) {
      return;
    }

    await persistState(deleteParticipantWeighIn(state, selectedParticipant.id));
    notify(`Vikten för ${selectedParticipant.name} är borttagen.`);
  });

  dom.presentModeBoard.addEventListener("click", async () => {
    await setPresentationMode("board");
  });

  dom.presentModeSpotlight.addEventListener("click", async () => {
    await setPresentationMode("spotlight", getPreferredSpotlightParticipantId());
  });

  dom.presentParticipant.addEventListener("change", async () => {
    const participantId = sanitizeId(dom.presentParticipant.value);
    if (!participantId) {
      return;
    }

    await persistState({
      ...state,
      presentation: {
        ...state.presentation,
        mode: "spotlight",
        spotlightParticipantId: participantId,
        spotlightAnchorAt: utcNowIso(),
      },
    });
  });

  dom.presentInterval.addEventListener("change", async () => {
    await persistState({
      ...state,
      presentation: {
        ...state.presentation,
        spotlightIntervalSec: sanitizeInterval(dom.presentInterval.value),
        spotlightAnchorAt: utcNowIso(),
      },
    });
  });

  dom.presentPrevButton.addEventListener("click", async () => {
    await shiftSpotlight(-1);
  });

  dom.presentNextButton.addEventListener("click", async () => {
    await shiftSpotlight(1);
  });

  dom.presentAutoplayButton.addEventListener("click", async () => {
    await persistState({
      ...state,
      presentation: {
        ...state.presentation,
        mode: "spotlight",
        spotlightParticipantId: getPreferredSpotlightParticipantId(),
        spotlightAutoplay: !state.presentation.spotlightAutoplay,
        spotlightAnchorAt: utcNowIso(),
      },
    });
  });

  [dom.presentOpenDisplayButton].forEach((button) => {
    if (button) {
      button.addEventListener("click", openDisplayWindow);
    }
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
      syncFromServer();
    }
  });

  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY || !event.newValue) {
      return;
    }

    try {
      const incomingState = normalizeState(JSON.parse(event.newValue));
      if (isIncomingStateNewer(incomingState, state)) {
        state = incomingState;
        render(true);
      }
    } catch (error) {
    console.warn("Kunde inte synka från lokal lagring.", error);
    }
  });
}

function setupLocalSync() {
  if (!("BroadcastChannel" in window)) {
    return;
  }

  runtime.channel = new BroadcastChannel(CHANNEL_NAME);
  runtime.channel.addEventListener("message", (event) => {
    const incomingState = normalizeState(event.data);
    if (isIncomingStateNewer(incomingState, state)) {
      state = incomingState;
      render(true);
    }
  });
}

function startPolling() {
  window.clearInterval(runtime.pollHandle);
  runtime.pollHandle = window.setInterval(() => {
    syncFromServer();
  }, POLL_INTERVAL_MS);
}

function startSpotlightTicker() {
  window.clearInterval(runtime.spotlightHandle);
  runtime.spotlightHandle = window.setInterval(() => {
    if (state.presentation.mode !== "spotlight" || !state.presentation.spotlightAutoplay) {
      return;
    }

    renderSettings();
    renderPresenter();
    renderDisplay();
  }, SPOTLIGHT_REFRESH_MS);
}

async function loadInitialState() {
  await syncFromServer({ allowFallbackNotice: false });
}

function armBoardSequence() {
  if (!DISPLAY_VIEW) {
    return;
  }

  runtime.boardSequenceArmed = true;
  runtime.lastBoardSequenceToken = state.weighIns.length ? state.weighIns[state.weighIns.length - 1].id : "";
}

async function syncFromServer(options = {}) {
  if (!isHttpMode()) {
    setSyncMode("local");
    return state;
  }

  try {
    const response = await fetch("/api/state", { cache: "no-store" });
    if (response.status === 401) {
      redirectToLogin();
      return state;
    }
    if (!response.ok) {
      throw new Error(`Status ${response.status}`);
    }

    const incomingState = normalizeState(await response.json());
    setSyncMode("server");
    const shouldRenderIncoming =
      isIncomingStateNewer(incomingState, state) || runtime.syncMode === "starting" || options.forceRender === true;

    if (shouldRenderIncoming) {
      state = incomingState;
      saveCachedState(state);
      render(true);
    }

    return state;
  } catch (error) {
    console.warn("Kunde inte hämta data från servern.", error);
    setSyncMode("warning");
    if (options.allowFallbackNotice !== false) {
      notify("Servern svarar inte just nu. Appen fortsatter med senast kanda data.");
    }
    return state;
  }
}

async function persistState(nextState) {
  const candidateState = normalizeState({
    ...nextState,
    updatedAt: utcNowIso(),
  });

  state = candidateState;
  saveCachedState(state);
  broadcastState(state);
  render(true);

  if (!isHttpMode()) {
    setSyncMode("local");
    return state;
  }

  try {
    const response = await fetch("/api/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(candidateState),
    });

    if (response.status === 401) {
      redirectToLogin();
      return candidateState;
    }

    if (!response.ok) {
      throw new Error(`Status ${response.status}`);
    }

    state = normalizeState(await response.json());
    saveCachedState(state);
    broadcastState(state);
    setSyncMode("server");
    render(true);
    return state;
  } catch (error) {
    console.warn("Kunde inte spara data till servern.", error);
    setSyncMode("warning");
    notify("Ändringen sparades lokalt men inte till servern.");
    return candidateState;
  }
}

function render(force = false) {
  state = normalizeState(state);
  standings = getStandings(state);
  ensureRuntimeSelections();
  configureLayout();
  renderSyncStatus();
  renderSettings();
  renderOperator();
  renderMeasurement();
  renderPresenter();
  renderDisplay(force);
}

function renderSettings() {
  syncInputValue(dom.eventName, state.eventName);
  syncInputValue(dom.eventSubtitle, state.eventSubtitle);
  syncInputValue(dom.eventRules, state.eventRules);
  dom.summaryTotal.textContent = String(standings.total);
  dom.summaryWeighed.textContent = String(standings.ranked.length);
  dom.summaryRemaining.textContent = String(standings.waiting.length);
  dom.summaryLeader.textContent = standings.leader
    ? `${standings.leader.name} · ${formatWeight(standings.leader.weightKg)}`
    : "-";

  const spotlightState = getSpotlightState(state, standings);
  dom.settingsPresentationMode.textContent = getModeLabel(state.presentation.mode);
  dom.settingsPresentationCopy.textContent = buildPresentationCopy(spotlightState);
  if (dom.settingsActiveCompetition) {
    dom.settingsActiveCompetition.textContent = state.eventName || "-";
  }
  dom.competitionHistoryList.innerHTML = buildCompetitionHistoryMarkup(state.competitionHistory || []);
}

function renderOperator() {
  renderParticipantEditor();
}

function renderMeasurement() {
  renderWeighInSection();
}

function renderParticipantEditor() {
  const filteredParticipants = getFilteredParticipants();
  const selectedParticipant = getSelectedParticipant();
  const visibleParticipant =
    selectedParticipant && filteredParticipants.some((participant) => participant.id === selectedParticipant.id)
      ? selectedParticipant
      : filteredParticipants[0] || null;

  if (visibleParticipant && runtime.selectedParticipantId !== visibleParticipant.id) {
    runtime.selectedParticipantId = visibleParticipant.id;
  } else if (!visibleParticipant && runtime.selectedParticipantId !== NEW_PARTICIPANT_VALUE) {
    runtime.selectedParticipantId = NEW_PARTICIPANT_VALUE;
  }

  const hasSelectedParticipant = Boolean(visibleParticipant);
  syncInputValue(dom.participantSearch, runtime.participantSearchQuery);

  renderSelectOptions(
    dom.participantSelect,
    filteredParticipants.map((participant) => ({
      value: participant.id,
      label: participant.team ? `${participant.name} · ${participant.team}` : participant.name,
    })),
    hasSelectedParticipant ? visibleParticipant.id : "",
  );

  dom.participantSelect.disabled = !filteredParticipants.length;
  if (!filteredParticipants.length) {
    dom.participantSearchSummary.textContent = state.participants.length
      ? "Ingen deltagare matchar sökningen."
      : "Inga deltagare registrerade ännu.";
  } else if (filteredParticipants.length === state.participants.length) {
    dom.participantSearchSummary.textContent = `Visar alla ${state.participants.length} deltagare.`;
  } else {
    dom.participantSearchSummary.textContent = `Visar ${filteredParticipants.length} av ${state.participants.length} deltagare.`;
  }

  syncInputValue(dom.participantName, visibleParticipant ? visibleParticipant.name : "");
  syncInputValue(dom.participantTeam, visibleParticipant ? visibleParticipant.team : "");
  dom.participantName.disabled = !hasSelectedParticipant;
  dom.participantTeam.disabled = !hasSelectedParticipant;
  dom.participantUsernamePreview.disabled = !hasSelectedParticipant;
  dom.participantPassword.disabled = !hasSelectedParticipant;
  dom.participantSaveButton.disabled = !hasSelectedParticipant;
  dom.participantDeleteButton.disabled = !hasSelectedParticipant;
  renderParticipantLoginFields();

  PARTICIPANT_IMAGE_STAGES.forEach((stage) => {
    const image = visibleParticipant && visibleParticipant.images
      ? normalizeParticipantImage(visibleParticipant.images[stage.key])
      : createParticipantImage();
    const imagePath = image.path;
    const input = dom.stageInputs.get(stage.key);
    const adjustButton = dom.stageAdjustButtons.get(stage.key);
    const removeButton = dom.stageRemoveButtons.get(stage.key);
    const previewImage = dom.stagePreviewImages.get(stage.key);
    const emptyState = dom.stagePreviewEmpty.get(stage.key);
    const status = dom.stageStatus.get(stage.key);

    input.disabled = !visibleParticipant;
    if (adjustButton) {
      adjustButton.disabled = !visibleParticipant || !imagePath;
    }
    if (removeButton) {
      removeButton.disabled = !visibleParticipant || !imagePath;
    }
    previewImage.hidden = !imagePath;
    previewImage.src = imagePath || "";
    previewImage.alt = visibleParticipant ? `${visibleParticipant.name} - ${stage.label}` : "";
    applyParticipantImageStyle(previewImage, image);
    emptyState.hidden = Boolean(imagePath);
    emptyState.textContent = visibleParticipant ? stage.emptyLabel : "Spara deltagaren innan du laddar upp bilder.";
    status.textContent = visibleParticipant
      ? imagePath
        ? `Bild kopplad för ${stage.label.toLowerCase()}.`
        : stage.emptyLabel
      : "Ingen deltagare vald.";
  });
}

function openImageAdjustDialog(participantId, stageKey, imageValue = null) {
  if (!(dom.imageAdjustDialog instanceof HTMLDialogElement)) {
    return;
  }

  const participant = state.participants.find((entry) => entry.id === participantId) || null;
  const image = normalizeParticipantImage(
    imageValue || (participant && participant.images ? participant.images[stageKey] : null),
  );

  if (!participant || !image.path) {
    notify("Ladda upp en bild innan du justerar utsnittet.");
    return;
  }

  const stage = getParticipantImageStage(stageKey);
  runtime.imageAdjustSession = {
    participantId,
    stageKey,
    image,
  };

  if (dom.imageAdjustTitle instanceof HTMLElement) {
    dom.imageAdjustTitle.textContent = `Justera ${stage.label}`;
  }
  if (dom.imageAdjustCopy instanceof HTMLElement) {
    dom.imageAdjustCopy.textContent = `Justera bilden så att samma utsnitt används i alla bildkort för ${participant.name}.`;
  }

  syncImageAdjustControls(image);
  renderImageAdjustPreview(image, participant.name, stage.label);

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

  runtime.imageAdjustSession = {
    ...runtime.imageAdjustSession,
    image: nextImage,
  };

  const participant = state.participants.find((entry) => entry.id === runtime.imageAdjustSession.participantId) || null;
  const stage = getParticipantImageStage(runtime.imageAdjustSession.stageKey);
  renderImageAdjustPreview(nextImage, participant ? participant.name : "", stage.label);
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

  const { participantId, stageKey, image } = runtime.imageAdjustSession;
  await persistState(updateParticipantImage(state, participantId, stageKey, image));
  closeImageAdjustDialog();
  notify("Bildutsnittet är sparat.");
}

function renderParticipantLoginFields() {
  const selectedParticipant = getSelectedParticipant();
  if (!selectedParticipant) {
    syncInputValue(dom.participantUsernamePreview, "");
    dom.participantUsernameHint.textContent = "Skapas automatiskt från namnet, till exempel Anna.Andersson.";
    if (document.activeElement !== dom.participantPassword) {
      dom.participantPassword.value = "";
    }
    return;
  }

  const previewName = sanitizeText(dom.participantName.value, 80) || selectedParticipant.name;
  const participantUsername = buildParticipantLoginUsername(previewName, selectedParticipant.id);
  syncInputValue(dom.participantUsernamePreview, participantUsername);
  dom.participantUsernameHint.textContent = `Deltagaren loggar in med ${participantUsername}.`;
}

function renderWeighInSection() {
  const filteredParticipants = getMeasurementFilteredParticipants();
  const selectedParticipant = getSelectedParticipant();
  const visibleParticipant =
    selectedParticipant && filteredParticipants.some((participant) => participant.id === selectedParticipant.id)
      ? selectedParticipant
      : filteredParticipants[0] || null;

  if (visibleParticipant && runtime.selectedParticipantId !== visibleParticipant.id) {
    runtime.selectedParticipantId = visibleParticipant.id;
  } else if (!visibleParticipant && runtime.selectedParticipantId !== NEW_PARTICIPANT_VALUE) {
    runtime.selectedParticipantId = NEW_PARTICIPANT_VALUE;
  }

  const selectedEntry = visibleParticipant ? getStandingEntry(visibleParticipant.id) : null;
  const participantWeighIn = visibleParticipant ? getParticipantWeighIn(visibleParticipant.id) : null;
  const weighInShowcase = getActiveWeighInShowcase(state.presentation);
  const isStartedForSelected =
    Boolean(visibleParticipant) &&
    weighInShowcase.phase === WEIGH_IN_SHOWCASE_PHASES.INTRO &&
    weighInShowcase.participantId === visibleParticipant.id;
  const isCountingForSelected =
    Boolean(visibleParticipant) &&
    weighInShowcase.phase === WEIGH_IN_SHOWCASE_PHASES.COUNTUP &&
    weighInShowcase.participantId === visibleParticipant.id;

  syncInputValue(dom.measurementParticipantSearch, runtime.measurementSearchQuery);

  renderSelectOptions(
    dom.measurementParticipantSelect,
    filteredParticipants.map((participant) => ({
      value: participant.id,
      label: participant.team ? `${participant.name} · ${participant.team}` : participant.name,
    })),
    visibleParticipant ? visibleParticipant.id : "",
  );

  if (!filteredParticipants.length) {
    dom.measurementParticipantSearchSummary.textContent = state.participants.length
      ? "Ingen deltagare matchar sökningen."
      : "Inga deltagare registrerade ännu.";
  } else if (filteredParticipants.length === state.participants.length) {
    dom.measurementParticipantSearchSummary.textContent = `Visar alla ${state.participants.length} deltagare.`;
  } else {
    dom.measurementParticipantSearchSummary.textContent = `Visar ${filteredParticipants.length} av ${state.participants.length} deltagare.`;
  }

  dom.measurementParticipantSearch.disabled = !state.participants.length;
  dom.measurementParticipantSelect.disabled = !filteredParticipants.length;
  dom.weighPanelTitle.textContent = visibleParticipant ? `Invägning för ${visibleParticipant.name}` : "Ingen deltagare vald";
  if (dom.weighPanelCopy instanceof HTMLElement) {
    dom.weighPanelCopy.textContent = visibleParticipant
      ? "Starta deltagaren på publikskärmen och lås sedan upp viktinmatningen när det är dags att väga frukten."
      : state.participants.length
        ? "Sök eller välj en deltagare i listan för att registrera eller uppdatera den personens vikt."
        : "Registrera deltagare först innan du börjar med mätning.";
  }
  dom.participantCurrentWeight.textContent = selectedEntry && selectedEntry.hasWeight ? formatWeight(selectedEntry.weightKg) : "-";
  dom.participantCurrentRank.textContent =
    selectedEntry && selectedEntry.hasWeight && selectedEntry.rank ? `Plats ${selectedEntry.rank}` : "-";
  dom.participantCurrentMeasuredAt.textContent = participantWeighIn ? formatDateTime(participantWeighIn.measuredAt) : "-";
  dom.participantCurrentStatus.textContent = !visibleParticipant
    ? "Ej vald"
    : isStartedForSelected
      ? "Redo för vikt"
      : isCountingForSelected
        ? "Visas live"
        : selectedEntry && selectedEntry.hasWeight
          ? "Registrerad"
          : "Redo att starta";
  if (dom.weighSequenceNote instanceof HTMLElement) {
    dom.weighSequenceNote.textContent = !visibleParticipant
      ? state.participants.length
        ? "Sök eller välj en deltagare för att starta invägningen."
        : "Registrera deltagare först för att kunna starta invägningen."
      : isStartedForSelected
        ? "Viktinmatningen är upplåst. Mata in vikten och tryck Uppdatera vikt när frukten är klar på vågen."
        : isCountingForSelected
          ? "Publikskärmen räknar just nu upp vikten och placerar sedan deltagaren i listan."
          : "Tryck Starta för att visa deltagaren stort på presentationsskärmen innan viktinmatningen öppnas.";
  }
  dom.weighWeight.disabled = !visibleParticipant || !isStartedForSelected;
  dom.weighStartButton.disabled = !visibleParticipant;
  dom.weighSaveButton.disabled = !visibleParticipant || !isStartedForSelected;
  dom.weighDeleteButton.disabled = !participantWeighIn;
  dom.weighSaveButton.textContent = "Uppdatera vikt";

  if (document.activeElement !== dom.weighWeight) {
    dom.weighWeight.value = participantWeighIn ? formatWeightInput(participantWeighIn.weightKg) : "";
  }
}

function renderPresenter() {
  const spotlightState = getSpotlightState(state, standings);
  const currentEntry = spotlightState.currentEntry;

  setToggleState(dom.presentModeBoard, state.presentation.mode === "board");
  setToggleState(dom.presentModeSpotlight, state.presentation.mode === "spotlight");

  renderSelectOptions(
    dom.presentParticipant,
    spotlightState.eligibleEntries.map((entry) => ({
      value: entry.id,
      label: entry.team ? `${entry.name} · ${entry.team}` : entry.name,
    })),
    spotlightState.selectedParticipantId,
  );

  syncSelectValue(dom.presentInterval, String(state.presentation.spotlightIntervalSec));
  dom.presentParticipant.disabled = !spotlightState.eligibleEntries.length;
  dom.presentInterval.disabled = !spotlightState.eligibleEntries.length;
  dom.presentPrevButton.disabled = spotlightState.eligibleEntries.length < 2;
  dom.presentNextButton.disabled = spotlightState.eligibleEntries.length < 2;
  dom.presentAutoplayButton.disabled = !spotlightState.eligibleEntries.length;
  dom.presentAutoplayButton.textContent = state.presentation.spotlightAutoplay ? "Auto på" : "Auto av";
  dom.presentCurrentMode.textContent = getModeLabel(state.presentation.mode);
  dom.presentCurrentParticipant.textContent = currentEntry ? currentEntry.name : "-";
  dom.presentCurrentAutoplay.textContent = state.presentation.spotlightAutoplay ? "På" : "Av";
  dom.presentCurrentScreen.textContent = DISPLAY_VIEW ? "Visas på denna skärm" : "Redo att öppnas";
  dom.presentCurrentCopy.textContent = buildPresentationCopy(spotlightState);
}

function renderDisplay(force = false) {
  const spotlightState = getSpotlightState(state, standings);
  const showSpotlight = state.presentation.mode === "spotlight";

  dom.displayBoard.hidden = showSpotlight;
  dom.displaySpotlight.hidden = !showSpotlight;
  dom.displayEventName.textContent = state.eventName;
  dom.displayEventSubtitle.textContent = state.eventSubtitle;
  dom.spotlightEventName.textContent = state.eventName;
  dom.spotlightEventSubtitle.textContent = state.eventSubtitle;

  if (showSpotlight) {
    cancelBoardWeighInSequence(true);
    runtime.lastBoardShowcaseSignature = "";
    renderSpotlightDisplay(spotlightState, force);
  } else {
    renderScoreboardDisplay(standings, force);
  }
}

function renderScoreboardDisplay(currentStandings, force = false) {
  const rankedEntries = currentStandings.ranked;
  const latestWeighIn = currentStandings.latestWeighIn;
  const weighInShowcase = getActiveWeighInShowcase(state.presentation);
  setScoreboardDensity(rankedEntries.length);

  if (!weighInShowcase.participantId || weighInShowcase.phase === WEIGH_IN_SHOWCASE_PHASES.IDLE) {
    pinBoardListToTopIfIdle();
  }

  if (!rankedEntries.length) {
    if (!weighInShowcase.participantId) {
      cancelBoardWeighInSequence(true);
      dom.scoreboardList.innerHTML =
      '<div class="display-empty">Första invägningen dyker upp här så snart ni registrerar en frukt.</div>';
    } else {
      if (!shouldDeferBoardScoreboardUpdate(weighInShowcase)) {
        dom.scoreboardList.innerHTML = "";
      }
      syncBoardWeighInShowcase(rankedEntries, latestWeighIn);
    }
    return;
  }

  if (shouldDeferBoardScoreboardUpdate(weighInShowcase)) {
    syncBoardWeighInShowcase(rankedEntries, latestWeighIn);
    return;
  }

  renderBoardScoreboardRows(rankedEntries, latestWeighIn, {
    forceHighlight: force,
    syncShowcase: true,
  });
}

function renderBoardScoreboardRows(rankedEntries, latestWeighIn, options = {}) {
  const existingRows = new Map(
    Array.from(dom.scoreboardList.querySelectorAll("[data-participant-id]")).map((element) => [
      element.dataset.participantId,
      element,
    ]),
  );
  const firstRects = new Map(
    Array.from(existingRows.entries()).map(([participantId, element]) => [participantId, element.getBoundingClientRect()]),
  );
  const fragment = document.createDocumentFragment();

  rankedEntries.forEach((entry) => {
    const row = existingRows.get(entry.id) || createScoreboardRow(entry);
    updateScoreboardRow(row, entry, latestWeighIn, options.forceHighlight || !existingRows.has(entry.id));
    fragment.appendChild(row);
    existingRows.delete(entry.id);
  });

  existingRows.forEach((row) => row.remove());
  dom.scoreboardList.innerHTML = "";
  dom.scoreboardList.appendChild(fragment);

  requestAnimationFrame(() => {
    rankedEntries.forEach((entry) => {
      const row = dom.scoreboardList.querySelector(`[data-participant-id="${entry.id}"]`);
      const firstRect = firstRects.get(entry.id);
      if (!row) {
        return;
      }

      cancelElementAnimations(row);

      if (firstRect) {
        const deltaY = firstRect.top - row.getBoundingClientRect().top;
        if (deltaY) {
          row.animate([{ transform: `translateY(${deltaY}px)` }, { transform: "translateY(0)" }], {
            duration: SCOREBOARD_MOVE_DURATION_MS,
            easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
          });
        }
      } else {
        row.animate(
          [
            { opacity: 0, transform: "translateY(28px) scale(0.98)" },
            { opacity: 1, transform: "translateY(0) scale(1)" },
          ],
          { duration: SCOREBOARD_ENTER_DURATION_MS, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" },
        );
      }
    });

    if (options.syncShowcase !== false) {
      syncBoardWeighInShowcase(rankedEntries, latestWeighIn);
    }
  });
}

function shouldDeferBoardScoreboardUpdate(weighInShowcase) {
  if (!DISPLAY_VIEW || state.presentation.mode !== "board") {
    return false;
  }

  if (weighInShowcase.phase !== WEIGH_IN_SHOWCASE_PHASES.COUNTUP) {
    return false;
  }

  const signature = getBoardShowcaseSignature(weighInShowcase);
  return Boolean(signature) && runtime.completedBoardShowcaseSignature !== signature;
}

function syncBoardWeighInShowcase(rankedEntries, latestWeighIn) {
  if (!DISPLAY_VIEW || state.presentation.mode !== "board") {
    return;
  }

  const weighInShowcase = getActiveWeighInShowcase(state.presentation);
  if (!weighInShowcase.participantId || weighInShowcase.phase === WEIGH_IN_SHOWCASE_PHASES.IDLE) {
    cancelBoardWeighInSequence(true);
    pinBoardListToTopIfIdle();
    return;
  }

  const entry = getBoardShowcaseEntry(weighInShowcase.participantId, rankedEntries);
  if (!entry) {
    return;
  }

  const signature = getBoardShowcaseSignature(weighInShowcase);
  if (isConsumedBoardShowcaseToken(weighInShowcase.token)) {
    runtime.lastBoardShowcaseSignature = signature;
    pinBoardListToTop(true);
    return;
  }

  if (
    weighInShowcase.phase === WEIGH_IN_SHOWCASE_PHASES.COUNTUP &&
    runtime.completedBoardShowcaseSignature === signature
  ) {
    return;
  }

  if (runtime.lastBoardShowcaseSignature === signature) {
    return;
  }

  runtime.lastBoardShowcaseSignature = signature;

  if (weighInShowcase.phase === WEIGH_IN_SHOWCASE_PHASES.INTRO) {
    runtime.completedBoardShowcaseSignature = "";
    showBoardWeighInIntro(entry);
    return;
  }

  if (!latestWeighIn || latestWeighIn.participantId !== entry.id) {
    return;
  }

  runBoardWeighInSequence(entry, latestWeighIn, weighInShowcase);
}

function getBoardShowcaseEntry(participantId, rankedEntries) {
  const rankedEntry = rankedEntries.find((entry) => entry.id === participantId);
  if (rankedEntry) {
    return rankedEntry;
  }

  const participant = state.participants.find((candidate) => candidate.id === participantId);
  if (!participant) {
    return null;
  }

  return {
    id: participant.id,
    name: participant.name,
    team: participant.team,
    rank: null,
    hasWeight: false,
    weightKg: 0,
    images: participant.images || createEmptyParticipantImages(),
  };
}

function showBoardWeighInIntro(entry) {
  cancelBoardWeighInSequence(true);

  const frameRect = dom.displayBoardFrame.getBoundingClientRect();
  if (!frameRect.width || !frameRect.height) {
    return;
  }

  const startRect = getBoardSequenceStartRect(frameRect, entry);
  populateBoardSequence(entry, {
      movement: "Väntar på att vikten matas in",
    weightText: "",
    hideWeight: true,
    hideRank: true,
  });
  dom.boardSequenceLayer.hidden = false;
  dom.boardSequenceLayer.classList.add("is-active");
  dom.displayBoard.classList.add("is-sequencing");
  positionBoardSequenceCard(startRect);
}

async function runBoardWeighInSequence(entry, latestWeighIn, weighInShowcase) {
  cancelBoardWeighInSequence(true, { preserveLayer: true, preserveGallery: true });
  runtime.boardSequenceRunId += 1;
  const runId = runtime.boardSequenceRunId;
  const showcaseSignature = getBoardShowcaseSignature(weighInShowcase);

  const frameRect = dom.displayBoardFrame.getBoundingClientRect();
  if (!frameRect.width || !frameRect.height) {
    return;
  }

  const startRect = getBoardSequenceStartRect(frameRect, entry);

  populateBoardSequence(entry, {
    movement: "",
    weightText: formatWeight(0),
    hideWeight: false,
    hideRank: true,
  });
  dom.boardSequenceLayer.hidden = false;
  dom.boardSequenceLayer.classList.add("is-active");
  dom.displayBoard.classList.add("is-sequencing");
  positionBoardSequenceCard(startRect);

  await animateBoardSequenceWeight(
    weighInShowcase.finalWeightKg !== null ? weighInShowcase.finalWeightKg : entry.weightKg,
    SCOREBOARD_SEQUENCE_COUNTUP_MS,
    runId,
    showcaseSignature,
  );
  if (runId !== runtime.boardSequenceRunId) {
    return;
  }

  const finalEntry = getBoardShowcaseEntry(weighInShowcase.participantId, standings.ranked);
  if (!finalEntry) {
    return;
  }

  populateBoardSequence(finalEntry, {
    movement: describeMovement(latestWeighIn),
    weightText: formatWeight(weighInShowcase.finalWeightKg !== null ? weighInShowcase.finalWeightKg : finalEntry.weightKg),
    hideWeight: false,
    hideRank: false,
  });

  await wait(SCOREBOARD_SEQUENCE_RESULT_HOLD_MS);
  if (runId !== runtime.boardSequenceRunId) {
    return;
  }

  runtime.completedBoardShowcaseSignature = showcaseSignature;
  renderBoardScoreboardRows(standings.ranked, standings.latestWeighIn, {
    forceHighlight: false,
    syncShowcase: false,
  });
  await nextFrame();
  if (runId !== runtime.boardSequenceRunId) {
    return;
  }

  const row = dom.scoreboardList.querySelector(`[data-participant-id="${finalEntry.id}"]`);
  const targetOffsetY = row ? getBoardSequenceTargetOffset(row) : 0;

  await animateBoardListTo(targetOffsetY, SCOREBOARD_SEQUENCE_SCROLL_MS);
  if (runId !== runtime.boardSequenceRunId) {
    return;
  }

  let landingRow = row;
  if (landingRow) {
    cancelElementAnimations(landingRow);
  }

  await nextFrame();
  if (runId !== runtime.boardSequenceRunId) {
    return;
  }

  if (landingRow) {
    const targetRect = getBoardSequenceTargetRect(landingRow);
    await animateBoardSequenceCardToRect(targetRect, runId);
    if (runId !== runtime.boardSequenceRunId) {
      return;
    }
  }

  dom.boardSequenceLayer.classList.remove("is-active");
  dom.boardSequenceLayer.hidden = true;
  dom.boardSequenceCard.removeAttribute("style");
  dom.boardSequenceCard.classList.remove("is-awaiting-weight");
  dom.boardSequenceWeight.classList.remove("is-empty");
  dom.boardSequenceRank.classList.remove("is-hidden");
  dom.displayBoard.classList.remove("is-sequencing");

  if (landingRow) {
    triggerBoardSequenceHighlight(landingRow, latestWeighIn);
  }

  await wait(SCOREBOARD_SEQUENCE_FOCUS_MS);
  if (runId !== runtime.boardSequenceRunId) {
    return;
  }

  await animateBoardListTo(0, SCOREBOARD_SEQUENCE_RETURN_MS);
  setBoardListOffset(0);

  if (runId !== runtime.boardSequenceRunId) {
    return;
  }

  await consumeCompletedWeighInShowcase(showcaseSignature, runId);
}

function populateBoardSequence(entry, options = {}) {
  dom.boardSequenceRank.textContent = options.hideRank ? "" : entry.rank ? String(entry.rank) : "";
  dom.boardSequenceName.textContent = entry.name;
  dom.boardSequenceTeam.textContent = entry.team || "Ingen lagetikett";
  dom.boardSequenceMovement.textContent = options.movement ?? "";
  dom.boardSequenceCard.classList.toggle("has-gallery", renderBoardSequenceGallery(entry));
  setBoardSequenceWeightText(options.weightText || "");
  dom.boardSequenceCard.classList.toggle("is-awaiting-weight", Boolean(options.hideWeight));
  dom.boardSequenceRank.classList.toggle("is-hidden", Boolean(options.hideRank));
  dom.boardSequenceWeight.classList.toggle("is-empty", Boolean(options.hideWeight));
}

function triggerBoardSequenceHighlight(row, latestWeighIn) {
  triggerTransientClass(row, "is-landing-focus", SCOREBOARD_SEQUENCE_FOCUS_MS);
  triggerTransientClass(row, "is-registering", SCOREBOARD_SEQUENCE_FOCUS_MS);

  const promotion =
    latestWeighIn.previousRank !== null &&
    latestWeighIn.rankAfter !== null &&
    latestWeighIn.rankAfter < latestWeighIn.previousRank;

  if (promotion || latestWeighIn.previousRank === null) {
    triggerTransientClass(row, "is-promoting", SCOREBOARD_SEQUENCE_FOCUS_MS);
  }
}

function getBoardSequenceStartRect(frameRect, entry = null) {
  const hasGallery = hasBoardSequenceGallery(entry);
  const width = Math.min(frameRect.width * 0.94, hasGallery ? 1240 : 1080);
  const height = hasGallery
    ? Math.min(Math.max(frameRect.height * 0.58, 380), 500)
    : Math.min(Math.max(frameRect.height * 0.4, 276), 340);
  const maxTop = Math.max(18, frameRect.height - height - 18);
  const viewportCenteredTop = ((window.innerHeight || frameRect.height) - height) / 2 - frameRect.top;
  return {
    left: Math.max(0, (frameRect.width - width) / 2),
    top: Math.min(maxTop, Math.max(18, viewportCenteredTop)),
    width,
    height,
  };
}

function getBoardSequenceTargetOffset(row) {
  const frameHeight = dom.displayBoardFrame.clientHeight;
  if (!frameHeight) {
    return 0;
  }

  const preferredTop = Math.min(Math.max(frameHeight * 0.24, 96), 170);
  const desiredOffset = Math.min(0, preferredTop - row.offsetTop);
  const lastRow = dom.scoreboardList.lastElementChild;

  if (!(lastRow instanceof HTMLElement)) {
    return desiredOffset;
  }

  const lastRowBottom = lastRow.offsetTop + lastRow.offsetHeight;
  const minimumBottom = Math.min(frameHeight - 28, preferredTop + row.offsetHeight + 108);
  const minOffset = minimumBottom - lastRowBottom;
  return Math.max(desiredOffset, Math.min(0, minOffset));
}

function getBoardSequenceTargetRect(row) {
  const frameRect = dom.displayBoardFrame.getBoundingClientRect();
  const rowRect = row.getBoundingClientRect();
  return {
    left: rowRect.left - frameRect.left,
    top: rowRect.top - frameRect.top,
    width: rowRect.width,
    height: rowRect.height,
  };
}

function positionBoardSequenceCard(rect) {
  cancelElementAnimations(dom.boardSequenceCard);
  dom.boardSequenceCard.classList.remove("is-landing");
  dom.boardSequenceCard.style.width = `${rect.width}px`;
  dom.boardSequenceCard.style.minHeight = `${rect.height}px`;
  dom.boardSequenceCard.style.height = "auto";
  dom.boardSequenceCard.style.opacity = "1";
  dom.boardSequenceCard.style.transform = `translate(${rect.left}px, ${rect.top}px) scale(1)`;
}

function animateBoardSequenceCardToRect(targetRect, runId) {
  if (!targetRect || runId !== runtime.boardSequenceRunId) {
    return Promise.resolve();
  }

  if (runtime.boardCardAnimation) {
    runtime.boardCardAnimation.cancel();
    runtime.boardCardAnimation = null;
  }

  cancelElementAnimations(dom.boardSequenceCard);

  const frameRect = dom.displayBoardFrame.getBoundingClientRect();
  const cardRect = dom.boardSequenceCard.getBoundingClientRect();
  if (!frameRect.width || !frameRect.height || !cardRect.width || !cardRect.height) {
    return Promise.resolve();
  }

  const currentRect = {
    left: cardRect.left - frameRect.left,
    top: cardRect.top - frameRect.top,
    width: cardRect.width,
    height: cardRect.height,
  };

  const scaleX = targetRect.width / currentRect.width;
  const scaleY = targetRect.height / currentRect.height;
  const uniformScale = Math.max(0.22, Math.min(scaleX, scaleY));
  const scaledWidth = currentRect.width * uniformScale;
  const scaledHeight = currentRect.height * uniformScale;
  const targetLeft = targetRect.left + (targetRect.width - scaledWidth) / 2;
  const targetTop = targetRect.top + (targetRect.height - scaledHeight) / 2;

  dom.boardSequenceCard.classList.add("is-landing");
  dom.boardSequenceCard.style.width = `${currentRect.width}px`;
  dom.boardSequenceCard.style.minHeight = `${currentRect.height}px`;
  dom.boardSequenceCard.style.height = "auto";
  dom.boardSequenceCard.style.transform = `translate(${currentRect.left}px, ${currentRect.top}px) scale(1)`;
  dom.boardSequenceCard.style.opacity = "1";

  const animation = dom.boardSequenceCard.animate(
    [
      {
        transform: `translate(${currentRect.left}px, ${currentRect.top}px) scale(1)`,
        opacity: 1,
      },
      {
        transform: `translate(${targetLeft}px, ${targetTop}px) scale(${uniformScale})`,
        opacity: 0.7,
      },
    ],
    {
      duration: SCOREBOARD_SEQUENCE_LAND_MS,
      easing: "cubic-bezier(0.18, 0.84, 0.22, 1)",
      fill: "forwards",
    },
  );

  runtime.boardCardAnimation = animation;
  return animation.finished
    .catch(() => {})
    .finally(() => {
      if (runtime.boardCardAnimation === animation) {
        runtime.boardCardAnimation = null;
      }
      if (runId === runtime.boardSequenceRunId) {
        dom.boardSequenceCard.style.transform = `translate(${targetLeft}px, ${targetTop}px) scale(${uniformScale})`;
        dom.boardSequenceCard.style.opacity = "0.7";
      }
    });
}

function animateBoardSequenceWeight(targetWeightKg, durationMs, runId, sequenceSeed = "") {
  cancelBoardWeightAnimation();
  dom.boardSequenceWeight.classList.remove("is-empty");
  ensureBoardSequenceWeightParts();

  const finalWeightKg = Math.max(0, Number(targetWeightKg) || 0);
  const finalWeightGrams = Math.round(finalWeightKg * 1000);
  if (durationMs <= 0) {
    setBoardSequenceWeightText(formatWeight(finalWeightKg));
    return Promise.resolve();
  }

  const profile = createBoardWeightCountupProfile(sequenceSeed, finalWeightGrams);
  const effectiveDurationMs = Math.max(3600, Math.round(durationMs * profile.durationMultiplier));
  const startedAt = performance.now();
  return new Promise((resolve) => {
    const tick = (now) => {
      if (runId !== runtime.boardSequenceRunId) {
        runtime.boardWeightFrameHandle = 0;
        resolve();
        return;
      }

      const progress = Math.min(1, (now - startedAt) / effectiveDurationMs);
      const easedProgress = getBoardWeightProgress(progress, profile);
      const currentWeightGrams = Math.min(finalWeightGrams, Math.floor(finalWeightGrams * easedProgress));
      setBoardSequenceWeightText(formatWeight(currentWeightGrams / 1000));

      if (progress < 1) {
        runtime.boardWeightFrameHandle = window.requestAnimationFrame(tick);
        return;
      }

      setBoardSequenceWeightText(formatWeight(finalWeightKg));
      runtime.boardWeightFrameHandle = 0;
      resolve();
    };

    runtime.boardWeightFrameHandle = window.requestAnimationFrame(tick);
  });
}

function setBoardSequenceWeightText(text) {
  ensureBoardSequenceWeightParts();
  const normalizedText = String(text || "").trim();
  const match = normalizedText.match(/^(.+?)\s+kg$/i);
  const valueText = match ? match[1] : normalizedText;
  const hasUnit = Boolean(match);

  dom.boardSequenceWeightValue.textContent = valueText || "";
  dom.boardSequenceWeightUnit.textContent = hasUnit ? "kg" : "";
  dom.boardSequenceWeight.classList.toggle("has-unit", hasUnit);
}

function renderBoardSequenceGallery(entry) {
  if (!(dom.boardSequenceGallery instanceof HTMLElement)) {
    return false;
  }

  if (!entry) {
    runtime.lastBoardSequenceGallerySignature = "";
    dom.boardSequenceGallery.hidden = true;
    dom.boardSequenceGallery.innerHTML = "";
    return false;
  }

  const images = normalizeParticipantImages(entry && entry.images);
  const gallerySignature = getBoardSequenceGallerySignature(entry);
  if (runtime.lastBoardSequenceGallerySignature === gallerySignature) {
    dom.boardSequenceGallery.hidden = false;
    return true;
  }

  runtime.lastBoardSequenceGallerySignature = gallerySignature;
  dom.boardSequenceGallery.hidden = false;
  dom.boardSequenceGallery.innerHTML = PARTICIPANT_IMAGE_STAGES.map((stage) => {
    const image = normalizeParticipantImage(images[stage.key]);
    const imagePath = image.path;
    if (imagePath) {
      return `
        <figure class="board-sequence-gallery__item is-filled">
          <img
            src="${escapeHtml(imagePath)}"
            alt="${escapeHtml(`${entry.name} - ${stage.label}`)}"
            style="${escapeHtml(buildParticipantImageStyle(image))}"
          />
        </figure>
      `;
    }

    return `
      <div
        class="board-sequence-gallery__item is-empty"
        aria-label="${escapeHtml(`Ingen bild för ${stage.label.toLowerCase()}`)}"
        title="${escapeHtml(stage.label)}"
      >
      </div>
    `;
  }).join("");
  return true;
}

function hasBoardSequenceGallery(entry) {
  return Boolean(entry);
}

function getBoardSequenceGallerySignature(entry) {
  if (!entry) {
    return "";
  }

  return `${entry.id}:${PARTICIPANT_IMAGE_STAGES.map((stage) =>
    getParticipantImageSignature(entry.images && entry.images[stage.key]),
  ).join("|")}`;
}

function getBoardSequenceStageShortLabel(stageKey) {
  if (stageKey === "sprout") {
    return "Planta";
  }
  if (stageKey === "flower") {
    return "Blomma";
  }
  if (stageKey === "harvest") {
    return "Skörd";
  }
  return "Bild";
}

function ensureBoardSequenceWeightParts() {
  if (!(dom.boardSequenceWeight instanceof HTMLElement)) {
    return;
  }

  const hasConnectedValue = dom.boardSequenceWeightValue instanceof HTMLElement && dom.boardSequenceWeightValue.isConnected;
  const hasConnectedUnit = dom.boardSequenceWeightUnit instanceof HTMLElement && dom.boardSequenceWeightUnit.isConnected;
  if (hasConnectedValue && hasConnectedUnit) {
    return;
  }

  dom.boardSequenceWeight.innerHTML = "";

  const valueElement = document.createElement("span");
  valueElement.className = "board-sequence-card__weight-value";
  valueElement.id = "board-sequence-weight-value";
  valueElement.textContent = "";

  const unitElement = document.createElement("span");
  unitElement.className = "board-sequence-card__weight-unit";
  unitElement.id = "board-sequence-weight-unit";
  unitElement.textContent = "";

  dom.boardSequenceWeight.append(valueElement, unitElement);
  dom.boardSequenceWeightValue = valueElement;
  dom.boardSequenceWeightUnit = unitElement;
}

function animateBoardListTo(offsetY, durationMs) {
  const currentOffsetY = getElementTranslateY(dom.scoreboardList);
  runtime.boardListOffsetY = currentOffsetY;

  if (runtime.boardListAnimation) {
    runtime.boardListAnimation.cancel();
    runtime.boardListAnimation = null;
  }

  cancelElementAnimations(dom.scoreboardList);
  setBoardListOffset(currentOffsetY);

  if (Math.abs(currentOffsetY - offsetY) < 0.5 || durationMs <= 0) {
    setBoardListOffset(offsetY);
    return Promise.resolve();
  }

  const animation = dom.scoreboardList.animate(
    [
      { transform: `translateY(${currentOffsetY}px)` },
      { transform: `translateY(${offsetY}px)` },
    ],
    {
      duration: durationMs,
      easing: "cubic-bezier(0.22, 0.8, 0.18, 1)",
      fill: "forwards",
    },
  );

  runtime.boardListAnimation = animation;
  return animation.finished.catch(() => {}).finally(() => {
    if (runtime.boardListAnimation === animation) {
      runtime.boardListAnimation = null;
    }
    setBoardListOffset(offsetY);
  });
}

function setBoardListOffset(offsetY) {
  runtime.boardListOffsetY = offsetY;
  dom.scoreboardList.style.transform = `translateY(${offsetY}px)`;
}

function pinBoardListToTop(force = false) {
  if (!DISPLAY_VIEW || !(dom.scoreboardList instanceof HTMLElement)) {
    return;
  }

  const activeShowcase = getActiveWeighInShowcase(state.presentation);
  if (!force && activeShowcase.participantId && activeShowcase.phase !== WEIGH_IN_SHOWCASE_PHASES.IDLE) {
    return;
  }

  setBoardListOffset(0);
  window.requestAnimationFrame(() => {
    const latestShowcase = getActiveWeighInShowcase(state.presentation);
    if (
      force ||
      !latestShowcase.participantId ||
      latestShowcase.phase === WEIGH_IN_SHOWCASE_PHASES.IDLE
    ) {
      setBoardListOffset(0);
    }
  });
}

function pinBoardListToTopIfIdle() {
  pinBoardListToTop(false);
}

function cancelBoardWeighInSequence(resetList = false, options = {}) {
  const preserveLayer = Boolean(options.preserveLayer);
  const preserveGallery = Boolean(options.preserveGallery);
  runtime.boardSequenceRunId += 1;
  const currentOffsetY = resetList ? 0 : getElementTranslateY(dom.scoreboardList);

  cancelBoardWeightAnimation();

  if (runtime.boardCardAnimation) {
    runtime.boardCardAnimation.cancel();
    runtime.boardCardAnimation = null;
  }

  if (runtime.boardListAnimation) {
    runtime.boardListAnimation.cancel();
    runtime.boardListAnimation = null;
  }

  cancelElementAnimations(dom.boardSequenceCard);
  cancelElementAnimations(dom.scoreboardList);
  dom.boardSequenceCard.classList.remove("is-landing");
  if (!preserveLayer) {
    dom.boardSequenceLayer.classList.remove("is-active");
    dom.boardSequenceLayer.hidden = true;
    dom.boardSequenceCard.removeAttribute("style");
    dom.boardSequenceCard.classList.remove("has-gallery");
    dom.boardSequenceCard.classList.remove("is-awaiting-weight");
    dom.boardSequenceRank.classList.remove("is-hidden");
    dom.boardSequenceWeight.classList.remove("is-empty");
    dom.displayBoard.classList.remove("is-sequencing");
  }

  if (!preserveGallery) {
    runtime.lastBoardSequenceGallerySignature = "";
    if (dom.boardSequenceGallery instanceof HTMLElement) {
      dom.boardSequenceGallery.hidden = true;
      dom.boardSequenceGallery.innerHTML = "";
    }
  }

  setBoardSequenceWeightText("");
  setBoardListOffset(currentOffsetY);
}

function cancelBoardWeightAnimation() {
  if (runtime.boardWeightFrameHandle) {
    window.cancelAnimationFrame(runtime.boardWeightFrameHandle);
    runtime.boardWeightFrameHandle = 0;
  }
}

function cancelElementAnimations(element) {
  if (!(element instanceof Element)) {
    return;
  }

  element.getAnimations().forEach((animation) => {
    try {
      animation.cancel();
    } catch {}
  });
}

function getElementTranslateY(element) {
  if (!(element instanceof HTMLElement)) {
    return 0;
  }

  const transform = window.getComputedStyle(element).transform;
  if (!transform || transform === "none") {
    return runtime.boardListOffsetY || 0;
  }

  try {
    return new DOMMatrixReadOnly(transform).m42;
  } catch {
    return runtime.boardListOffsetY || 0;
  }
}

function createBoardWeightCountupProfile(seedText, finalWeightGrams) {
  const random = createSeededRandom(`${seedText}:${finalWeightGrams}`);
  const surgeTime = 0.16 + random() * 0.08;
  const surgeValue = 0.72 + random() * 0.1;
  const settleTime = Math.min(0.64, surgeTime + 0.22 + random() * 0.12);
  const settleValue = Math.max(surgeValue + 0.08, 0.86 + random() * 0.06);
  const suspenseTime = Math.min(0.88, settleTime + 0.16 + random() * 0.16);
  const minimumTailGrams = Math.min(Math.max(12, finalWeightGrams * 0.012), 42);
  const maximumSuspenseValue = finalWeightGrams > 0 ? Math.max(settleValue + 0.02, 1 - minimumTailGrams / finalWeightGrams) : 0.98;
  const suspenseValueUpperBound = Math.min(0.985, maximumSuspenseValue);
  const suspenseValueLowerBound = Math.min(
    suspenseValueUpperBound - 0.002,
    Math.max(settleValue + 0.02, 0.944),
  );
  const suspenseValue =
    suspenseValueUpperBound <= suspenseValueLowerBound
      ? suspenseValueUpperBound
      : suspenseValueLowerBound + (suspenseValueUpperBound - suspenseValueLowerBound) * random();

  return {
    surgeTime,
    surgeValue,
    settleTime,
    settleValue: Math.min(0.95, settleValue),
    suspenseTime: Math.max(settleTime + 0.08, suspenseTime),
    suspenseValue: Math.min(0.988, suspenseValue),
    finaleHoldPortion: 0.42 + random() * 0.22,
    durationMultiplier: 0.94 + random() * 0.18,
  };
}

function getBoardWeightProgress(progress, profile) {
  const clamped = Math.max(0, Math.min(1, progress));

  if (clamped <= profile.surgeTime) {
    const localProgress = clamped / profile.surgeTime;
    return profile.surgeValue * easeOutPower(localProgress, 2.7);
  }

  if (clamped <= profile.settleTime) {
    const localProgress = (clamped - profile.surgeTime) / Math.max(0.001, profile.settleTime - profile.surgeTime);
    return interpolate(profile.surgeValue, profile.settleValue, easeInOutSine(localProgress));
  }

  if (clamped <= profile.suspenseTime) {
    const localProgress = (clamped - profile.settleTime) / Math.max(0.001, profile.suspenseTime - profile.settleTime);
    return interpolate(profile.settleValue, profile.suspenseValue, easeInOutSine(localProgress));
  }

  const finaleProgress = (clamped - profile.suspenseTime) / Math.max(0.001, 1 - profile.suspenseTime);
  const holdPortion = profile.finaleHoldPortion;
  const finaleCurve =
    finaleProgress < holdPortion
      ? 0.76 * easeInOutSine(finaleProgress / holdPortion)
      : 0.76 + 0.24 * easeOutPower((finaleProgress - holdPortion) / Math.max(0.001, 1 - holdPortion), 3.6);

  return interpolate(profile.suspenseValue, 1, finaleCurve);
}

function createSeededRandom(seedText) {
  let seed = 2166136261;
  for (let index = 0; index < seedText.length; index += 1) {
    seed ^= seedText.charCodeAt(index);
    seed = Math.imul(seed, 16777619);
  }

  return () => {
    seed += 0x6d2b79f5;
    let value = seed;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function interpolate(start, end, progress) {
  return start + (end - start) * progress;
}

function easeOutPower(progress, power = 2) {
  const clamped = Math.max(0, Math.min(1, progress));
  return 1 - (1 - clamped) ** power;
}

function easeInOutSine(progress) {
  const clamped = Math.max(0, Math.min(1, progress));
  return 0.5 - Math.cos(Math.PI * clamped) / 2;
}

function getBoardShowcaseSignature(weighInShowcase) {
  if (!weighInShowcase || !weighInShowcase.participantId || weighInShowcase.phase === WEIGH_IN_SHOWCASE_PHASES.IDLE) {
    return "";
  }

  return `${weighInShowcase.token}:${weighInShowcase.phase}:${weighInShowcase.finalWeightKg ?? ""}`;
}

function isConsumedBoardShowcaseToken(token) {
  const normalizedToken = sanitizeId(token);
  if (!normalizedToken || !runtime.lastConsumedBoardShowcaseToken) {
    return false;
  }

  return runtime.lastConsumedBoardShowcaseToken === normalizedToken;
}

async function consumeCompletedWeighInShowcase(signature, runId) {
  if (!signature || runId !== runtime.boardSequenceRunId) {
    return;
  }

  const activeShowcase = getActiveWeighInShowcase(state.presentation);
  if (getBoardShowcaseSignature(activeShowcase) !== signature) {
    return;
  }

  runtime.lastConsumedBoardShowcaseToken = sanitizeId(activeShowcase.token);

  await persistState({
    ...state,
    presentation: {
      ...state.presentation,
      weighInShowcase: createEmptyWeighInShowcase(),
    },
  });
  pinBoardListToTopIfIdle();
}

function setScoreboardDensity(entryCount) {
  dom.displayBoard.classList.remove("scoreboard-density--compact", "scoreboard-density--dense");

  if (entryCount >= 8) {
    dom.displayBoard.classList.add("scoreboard-density--dense");
    return;
  }

  if (entryCount >= 6) {
    dom.displayBoard.classList.add("scoreboard-density--compact");
  }
}

function createScoreboardRow(entry) {
  const row = document.createElement("article");
  row.className = "scoreboard-row";
  row.dataset.participantId = entry.id;
  row.innerHTML = `
    <div class="scoreboard-row__rank"></div>
    <div class="scoreboard-row__copy">
      <h2 class="scoreboard-row__name"></h2>
      <p class="scoreboard-row__team"></p>
    </div>
    <div class="scoreboard-row__weight"></div>
  `;
  return row;
}

function updateScoreboardRow(row, entry, latestWeighIn, forceHighlight = false) {
  row.querySelector(".scoreboard-row__rank").textContent = String(entry.rank);
  row.querySelector(".scoreboard-row__name").textContent = entry.name;
  row.querySelector(".scoreboard-row__team").textContent = entry.team || "Ingen lagetikett";
  row.querySelector(".scoreboard-row__weight").textContent = formatWeight(entry.weightKg);
  row.classList.toggle("is-leader", entry.rank === 1);

  if (!latestWeighIn || latestWeighIn.participantId !== entry.id) {
    return;
  }

  if (shouldSuppressBoardRowHighlight(entry.id, latestWeighIn)) {
    return;
  }

  const promotion = latestWeighIn.previousRank !== null && latestWeighIn.rankAfter !== null && latestWeighIn.rankAfter < latestWeighIn.previousRank;
  if (forceHighlight || row.dataset.latestToken !== latestWeighIn.id) {
    row.dataset.latestToken = latestWeighIn.id;
    triggerTransientClass(row, "is-registering", SCOREBOARD_REGISTER_HIGHLIGHT_MS);
    if (promotion || latestWeighIn.previousRank === null) {
      triggerTransientClass(row, "is-promoting", SCOREBOARD_PROMOTION_HIGHLIGHT_MS);
    }
  }
}

function shouldSuppressBoardRowHighlight(participantId, latestWeighIn) {
  if (!DISPLAY_VIEW || state.presentation.mode !== "board" || !latestWeighIn || latestWeighIn.participantId !== participantId) {
    return false;
  }

  const weighInShowcase = getActiveWeighInShowcase(state.presentation);
  return (
    weighInShowcase.phase === WEIGH_IN_SHOWCASE_PHASES.COUNTUP &&
    weighInShowcase.participantId === participantId
  );
}

function renderSpotlightDisplay(spotlightState, force = false) {
  const entry = spotlightState.currentEntry;

  if (!entry) {
    dom.spotlightRank.textContent = "-";
    dom.spotlightName.textContent = "Ingen deltagare vald";
    dom.spotlightTeam.textContent = "Lägg till deltagare för att starta spotlightläget.";
    dom.spotlightWeight.textContent = "-";
    const emptyGallerySignature = "empty";
    if (force || runtime.lastSpotlightGallerySignature !== emptyGallerySignature) {
      runtime.lastSpotlightGallerySignature = emptyGallerySignature;
      dom.spotlightGallery.innerHTML = PARTICIPANT_IMAGE_STAGES.map(
        (stage) => `
          <article class="gallery-card">
            <div class="gallery-card__media gallery-card__media--placeholder">Ingen bild</div>
            <div class="gallery-card__body">
              <p class="gallery-card__kicker">${stage.label}</p>
            </div>
          </article>
        `,
      ).join("");
    }
    return;
  }

  dom.spotlightRank.textContent = entry.rank ? `Plats ${entry.rank}` : "Redo";
  dom.spotlightName.textContent = entry.name;
  dom.spotlightTeam.textContent = entry.team || "Ingen lagetikett";
  dom.spotlightWeight.textContent = entry.hasWeight ? formatWeight(entry.weightKg) : "Ingen vikt än";
  const gallerySignature = getSpotlightGallerySignature(entry);
  if (force || runtime.lastSpotlightGallerySignature !== gallerySignature) {
    runtime.lastSpotlightGallerySignature = gallerySignature;
    dom.spotlightGallery.innerHTML = PARTICIPANT_IMAGE_STAGES.map((stage) => renderGalleryCard(entry, stage)).join("");
  }

  const signature = `${entry.id}:${entry.rank || 0}:${spotlightState.currentIndex}:${state.presentation.spotlightAutoplay}`;
  if (force || runtime.lastSpotlightSignature !== signature) {
    runtime.lastSpotlightSignature = signature;
    triggerTransientClass(dom.spotlightCard, "is-entering", 900);
  }
}

function getSpotlightGallerySignature(entry) {
  if (!entry) {
    return "empty";
  }

  const imageSignature = PARTICIPANT_IMAGE_STAGES.map((stage) =>
    getParticipantImageSignature(entry.images && entry.images[stage.key]),
  ).join("|");
  return `${entry.id}:${imageSignature}`;
}

function renderGalleryCard(entry, stage) {
  const image = normalizeParticipantImage(entry.images && entry.images[stage.key]);
  const imagePath = image.path;
  if (!imagePath) {
    return `
      <article class="gallery-card">
        <div class="gallery-card__media gallery-card__media--placeholder">Ingen bild</div>
        <div class="gallery-card__body">
          <p class="gallery-card__kicker">${stage.label}</p>
        </div>
      </article>
    `;
  }

  return `
    <article class="gallery-card is-filled">
      <div class="gallery-card__media">
        <img
          src="${escapeHtml(imagePath)}"
          alt="${escapeHtml(entry.name)} - ${escapeHtml(stage.label)}"
          style="${escapeHtml(buildParticipantImageStyle(image))}"
        />
      </div>
      <div class="gallery-card__body">
        <p class="gallery-card__kicker">${stage.label}</p>
      </div>
    </article>
  `;
}

function ensureRuntimeSelections() {
  const participantIds = new Set(state.participants.map((participant) => participant.id));

  if (!runtime.selectedParticipantId) {
    runtime.selectedParticipantId = state.participants.length ? state.participants[0].id : NEW_PARTICIPANT_VALUE;
  } else if (runtime.selectedParticipantId !== NEW_PARTICIPANT_VALUE && !participantIds.has(runtime.selectedParticipantId)) {
    runtime.selectedParticipantId = state.participants.length ? state.participants[0].id : NEW_PARTICIPANT_VALUE;
  }
}

function renderSyncStatus() {
  if (!(dom.syncStatus instanceof HTMLElement)) {
    return;
  }

  dom.syncStatus.classList.remove("is-server", "is-local", "is-warning");

  if (runtime.syncMode === "server") {
    dom.syncStatus.textContent = "Ansluten till lokal server";
    dom.syncStatus.classList.add("is-server");
    return;
  }

  if (runtime.syncMode === "local") {
    dom.syncStatus.textContent = "Kör lokalt i webbläsaren";
    dom.syncStatus.classList.add("is-local");
    return;
  }

  if (runtime.syncMode === "warning") {
    dom.syncStatus.textContent = "Servern svarar inte";
    dom.syncStatus.classList.add("is-warning");
    return;
  }

  dom.syncStatus.textContent = "Startar upp...";
}

function setSyncMode(mode) {
  runtime.syncMode = mode;
  renderSyncStatus();
}

function getSelectedParticipant() {
  return state.participants.find((participant) => participant.id === runtime.selectedParticipantId) || null;
}

function getFilteredParticipants() {
  const query = sanitizeText(runtime.participantSearchQuery, 80).toLocaleLowerCase("sv-SE");
  if (!query) {
    return [...state.participants];
  }

  return state.participants.filter((participant) => {
    const loginUsername = buildParticipantLoginUsername(participant.name, participant.id).toLocaleLowerCase("sv-SE");
    return [participant.name, participant.team, loginUsername]
      .map((value) => sanitizeText(value, 80).toLocaleLowerCase("sv-SE"))
      .some((value) => value.includes(query));
  });
}

function getMeasurementFilteredParticipants() {
  const query = sanitizeText(runtime.measurementSearchQuery, 80).toLocaleLowerCase("sv-SE");
  if (!query) {
    return [...state.participants];
  }

  return state.participants.filter((participant) => {
    const loginUsername = buildParticipantLoginUsername(participant.name, participant.id).toLocaleLowerCase("sv-SE");
    return [participant.name, participant.team, loginUsername]
      .map((value) => sanitizeText(value, 80).toLocaleLowerCase("sv-SE"))
      .some((value) => value.includes(query));
  });
}

function getStandingEntry(participantId) {
  return standings.all.find((entry) => entry.id === participantId) || null;
}

function getParticipantWeighIn(participantId) {
  if (!participantId) {
    return null;
  }
  return [...state.weighIns]
    .sort(sortWeighInsDescending)
    .find((weighIn) => weighIn.participantId === participantId) || null;
}

function openParticipantCreateDialog() {
  dom.participantCreateForm.reset();
  if (typeof dom.participantCreateDialog.showModal === "function") {
    if (!dom.participantCreateDialog.open) {
      dom.participantCreateDialog.showModal();
    }
  } else {
    dom.participantCreateDialog.setAttribute("open", "");
  }
  window.setTimeout(() => {
    dom.participantCreateName.focus();
  }, 0);
}

function closeParticipantCreateDialog() {
  if (typeof dom.participantCreateDialog.close === "function") {
    if (dom.participantCreateDialog.open) {
      dom.participantCreateDialog.close();
    }
  } else {
    dom.participantCreateDialog.removeAttribute("open");
    dom.participantCreateForm.reset();
  }
}

function getPreferredSpotlightParticipantId() {
  const selectedParticipant = getSelectedParticipant();
  const currentEntry = getSpotlightState(state, standings).currentEntry;
  return (selectedParticipant ? selectedParticipant.id : "") || (currentEntry ? currentEntry.id : "") || (state.participants.length ? state.participants[0].id : "");
}

async function setPresentationMode(mode, participantId = "") {
  if (mode === "spotlight" && !state.participants.length) {
    notify("Lägg till minst en deltagare innan du startar spotlightläget.");
    return;
  }

  await persistState({
    ...state,
    presentation: {
      ...state.presentation,
      mode,
      spotlightParticipantId: mode === "spotlight" ? sanitizeId(participantId) || getPreferredSpotlightParticipantId() : state.presentation.spotlightParticipantId,
      spotlightAnchorAt: mode === "spotlight" ? utcNowIso() : state.presentation.spotlightAnchorAt,
    },
  });
}

async function shiftSpotlight(direction) {
  const spotlightState = getSpotlightState(state, standings);
  if (spotlightState.eligibleEntries.length < 2) {
    return;
  }

  const nextIndex = modulo(spotlightState.currentIndex + direction, spotlightState.eligibleEntries.length);
  await persistState({
    ...state,
    presentation: {
      ...state.presentation,
      mode: "spotlight",
      spotlightParticipantId: spotlightState.eligibleEntries[nextIndex].id,
      spotlightAnchorAt: utcNowIso(),
    },
  });
}

function getSpotlightState(currentState, currentStandings, atMs = Date.now()) {
  const eligibleEntries = currentStandings.all.length
    ? currentStandings.all
    : currentState.participants.map((participant) => ({ ...participant, hasWeight: false, rank: null }));

  if (!eligibleEntries.length) {
    return { eligibleEntries: [], currentEntry: null, currentIndex: 0, selectedParticipantId: "" };
  }

  const selectedEntry = eligibleEntries.find((entry) => entry.id === currentState.presentation.spotlightParticipantId);
  const selectedParticipantId = selectedEntry ? selectedEntry.id : eligibleEntries[0].id;
  const baseIndex = eligibleEntries.findIndex((entry) => entry.id === selectedParticipantId);
  const intervalMs = currentState.presentation.spotlightIntervalSec * 1000;
  const anchorAtMs = Date.parse(currentState.presentation.spotlightAnchorAt) || atMs;
  const stepCount =
    currentState.presentation.mode === "spotlight" &&
    currentState.presentation.spotlightAutoplay &&
    eligibleEntries.length > 1
      ? Math.max(0, Math.floor((atMs - anchorAtMs) / intervalMs))
      : 0;
  const currentIndex = modulo(baseIndex + stepCount, eligibleEntries.length);

  return {
    eligibleEntries,
    currentEntry: eligibleEntries[currentIndex],
    currentIndex,
    selectedParticipantId,
  };
}

function buildPresentationCopy(spotlightState) {
  if (state.presentation.mode === "board") {
    return "Publikskärmen visar den centrerade scoreboarden live medan operatören kan fortsätta registrera i lugn och ro.";
  }

  if (!spotlightState.currentEntry) {
    return "Spotlightläget är förberett men väntar på deltagare och material.";
  }

  if (state.presentation.spotlightAutoplay) {
    return `${spotlightState.currentEntry.name} visas nu. Publikskärmen växlar automatiskt var ${state.presentation.spotlightIntervalSec}:e sekund.`;
  }

  return `${spotlightState.currentEntry.name} visas nu. Använd föregående och nästa för att styra presentationen manuellt.`;
}

function getModeLabel(mode) {
  return mode === "spotlight" ? "Deltagarpresentation" : "Scoreboard";
}

function startParticipantWeighInShowcase(currentState, participantId) {
  return normalizeState({
    ...currentState,
    presentation: {
      ...currentState.presentation,
      mode: "board",
      weighInShowcase: {
        token: createId("seq"),
        participantId,
        phase: WEIGH_IN_SHOWCASE_PHASES.INTRO,
        finalWeightKg: null,
        startedAt: utcNowIso(),
      },
    },
  });
}

function commitParticipantWeighInShowcase(currentState, participantId, weightKg) {
  const nextState = upsertParticipantWeighIn(currentState, participantId, weightKg);
  const currentShowcase = normalizeWeighInShowcase(currentState.presentation && currentState.presentation.weighInShowcase, currentState.participants);
  const showcaseToken =
    currentShowcase.phase === WEIGH_IN_SHOWCASE_PHASES.INTRO && currentShowcase.participantId === participantId
      ? currentShowcase.token
      : createId("seq");

  return normalizeState({
    ...nextState,
    presentation: {
      ...nextState.presentation,
      mode: "board",
      weighInShowcase: {
        token: showcaseToken,
        participantId,
        phase: WEIGH_IN_SHOWCASE_PHASES.COUNTUP,
        finalWeightKg: weightKg,
        startedAt: utcNowIso(),
      },
    },
  });
}

function upsertParticipantWeighIn(currentState, participantId, weightKg) {
  return recalculateWeighIns({
    ...currentState,
    weighIns: currentState.weighIns
      .filter((weighIn) => weighIn.participantId !== participantId)
      .concat({
        id: createId("w"),
        participantId,
        weightKg,
        measuredAt: utcNowIso(),
        previousRank: null,
        rankAfter: null,
      }),
  });
}

function deleteParticipantWeighIn(currentState, participantId) {
  return recalculateWeighIns({
    ...currentState,
    weighIns: currentState.weighIns.filter((weighIn) => weighIn.participantId !== participantId),
  });
}

function removeParticipant(currentState, participantId) {
  return recalculateWeighIns({
    ...currentState,
    participants: currentState.participants.filter((participant) => participant.id !== participantId),
    weighIns: currentState.weighIns.filter((weighIn) => weighIn.participantId !== participantId),
    presentation: {
      ...currentState.presentation,
      spotlightParticipantId:
        currentState.presentation.spotlightParticipantId === participantId
          ? (currentState.participants.find((participant) => participant.id !== participantId) || { id: "" }).id
          : currentState.presentation.spotlightParticipantId,
    },
  });
}

function recalculateWeighIns(currentState) {
  const baseState = normalizeState({ ...currentState, weighIns: [] });
  const orderedWeighIns = [...normalizeState(currentState).weighIns].sort(sortWeighInsAscending);
  let workingState = baseState;

  orderedWeighIns.forEach((candidate) => {
    const previousRankMap = getRankMap(getStandings(workingState).ranked);
    const nextWeighIn = {
      ...candidate,
      previousRank: previousRankMap.has(candidate.participantId) ? previousRankMap.get(candidate.participantId) : null,
      rankAfter: null,
    };

    const provisionalState = normalizeState({ ...workingState, weighIns: workingState.weighIns.concat(nextWeighIn) });
    const nextRankMap = getRankMap(getStandings(provisionalState).ranked);

    workingState = normalizeState({
      ...provisionalState,
      weighIns: provisionalState.weighIns.map((weighIn) =>
        weighIn.id === nextWeighIn.id
          ? { ...weighIn, rankAfter: nextRankMap.has(weighIn.participantId) ? nextRankMap.get(weighIn.participantId) : null }
          : weighIn,
      ),
    });
  });

  return workingState;
}

function updateParticipantImage(currentState, participantId, stageKey, imageValue) {
  return normalizeState({
    ...currentState,
    participants: currentState.participants.map((participant) =>
      participant.id === participantId
        ? {
            ...participant,
            images: {
              ...createEmptyParticipantImages(),
              ...normalizeParticipantImages(participant.images),
              [stageKey]: normalizeParticipantImage(imageValue),
            },
          }
        : participant,
    ),
  });
}

function getStandings(currentState) {
  const latestWeighInByParticipant = new Map();
  const participantMap = new Map(currentState.participants.map((participant) => [participant.id, participant]));
  currentState.weighIns.forEach((weighIn) => {
    latestWeighInByParticipant.set(weighIn.participantId, weighIn);
  });

  const ranked = currentState.participants
    .filter((participant) => latestWeighInByParticipant.has(participant.id))
    .map((participant) => {
      const weighIn = latestWeighInByParticipant.get(participant.id);
      return { ...participant, hasWeight: true, weightKg: weighIn.weightKg, measuredAt: weighIn.measuredAt, latestWeighInId: weighIn.id };
    })
    .sort((left, right) => {
      if (right.weightKg !== left.weightKg) {
        return right.weightKg - left.weightKg;
      }
      const leftTime = Date.parse(left.measuredAt);
      const rightTime = Date.parse(right.measuredAt);
      if (leftTime !== rightTime) {
        return leftTime - rightTime;
      }
      return left.name.localeCompare(right.name, "sv-SE");
    })
    .map((entry, index) => ({ ...entry, rank: index + 1 }));

  const rankedIds = new Set(ranked.map((entry) => entry.id));
  const waiting = currentState.participants
    .filter((participant) => !rankedIds.has(participant.id))
    .map((participant) => ({ ...participant, hasWeight: false, rank: null, weightKg: null, measuredAt: "" }));

  return {
    total: currentState.participants.length,
    leader: ranked[0] || null,
    ranked,
    waiting,
    all: ranked.concat(waiting),
    latestWeighIn: currentState.weighIns[currentState.weighIns.length - 1] || null,
    participantMap,
  };
}

async function storeParticipantStageImage(file, participantId, stageKey) {
  const dataUrl = await readFileAsDataUrl(file);
  if (!isHttpMode()) {
    return dataUrl;
  }

  const response = await fetch("/api/upload-image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ participantId, stageKey, dataUrl }),
  });

  if (response.status === 401) {
    redirectToLogin();
    throw new Error("Unauthorized");
  }

  if (!response.ok) {
    throw new Error(`Status ${response.status}`);
  }

  const payload = await response.json();
  return sanitizeImagePath(payload.path);
}

async function persistParticipantPassword(participantId, password) {
  if (!isHttpMode()) {
    throw new Error("Password updates require server mode.");
  }

  const response = await fetch("/api/admin/participant-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ participantId, password }),
  });

  if (response.status === 401) {
    redirectToLogin();
    throw new Error("Unauthorized");
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || `Status ${response.status}`);
  }
}

async function createNextCompetition() {
  if (!isHttpMode()) {
    throw new Error("Competition management requires server mode.");
  }

  const response = await fetch("/api/admin/competition", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "create-next" }),
  });

  if (response.status === 401) {
    redirectToLogin();
    throw new Error("Unauthorized");
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `Status ${response.status}`);
  }

  state = normalizeState(payload);
  saveCachedState(state);
  broadcastState(state);
  setSyncMode("server");
  render(true);
  return state;
}

async function activateCompetition(competitionId) {
  if (!isHttpMode()) {
    throw new Error("Competition management requires server mode.");
  }

  const response = await fetch("/api/admin/competition", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "activate", competitionId }),
  });

  if (response.status === 401) {
    redirectToLogin();
    throw new Error("Unauthorized");
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `Status ${response.status}`);
  }

  state = normalizeState(payload);
  saveCachedState(state);
  broadcastState(state);
  setSyncMode("server");
  render(true);
  return state;
}

async function deleteCompetition(competitionId) {
  if (!isHttpMode()) {
    throw new Error("Competition management requires server mode.");
  }

  const response = await fetch("/api/admin/competition", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "delete", competitionId }),
  });

  if (response.status === 401) {
    redirectToLogin();
    throw new Error("Unauthorized");
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `Status ${response.status}`);
  }

  state = normalizeState(payload);
  saveCachedState(state);
  broadcastState(state);
  setSyncMode("server");
  render(true);
  return state;
}

function buildCompetitionHistoryMarkup(competitionHistory) {
  if (!Array.isArray(competitionHistory) || !competitionHistory.length) {
    return '<div class="display-empty">Inga tidigare tävlingar finns sparade ännu.</div>';
  }

  return competitionHistory
    .map((competition) => {
      const badge = competition.isActive ? '<span class="competition-history__badge">Aktiv</span>' : "";
      const meta = `${competition.participantCount} deltagare · ${competition.weighedCount} invägda`;
      const action = competition.isActive
        ? '<span class="competition-history__action is-disabled">Aktiv nu</span>'
        : `
            <div class="competition-history__actions">
              <button class="ghost-button competition-history__action" type="button" data-competition-activate="${escapeHtml(competition.id)}">Aktivera</button>
              <button class="ghost-button ghost-button--danger competition-history__action" type="button" data-competition-delete="${escapeHtml(competition.id)}">Ta bort</button>
            </div>
          `;
      return `
        <div class="competition-history__item${competition.isActive ? " is-active" : ""}">
          <div class="competition-history__copy">
            <strong>${escapeHtml(competition.eventName || `Tävling ${competition.year}`)}</strong>
            <span>${escapeHtml(meta)}</span>
          </div>
          <div class="competition-history__meta">
            ${badge}
            ${action}
          </div>
        </div>
      `;
    })
    .join("");
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Kunde inte lasa filen."));
    reader.readAsDataURL(file);
  });
}

function createDefaultState() {
  return normalizeState({
    version: 3,
    competitionId: "comp_current",
    competitionYear: new Date().getFullYear(),
    activeCompetitionId: "comp_current",
    competitionHistory: [],
    eventName: "Odlingskampen",
    eventSubtitle: "Företagets live-scoreboard för fruktvägningen.",
    eventRules: "",
    participants: [],
    weighIns: [],
    presentation: {
      mode: "board",
      spotlightParticipantId: "",
      spotlightAutoplay: true,
      spotlightIntervalSec: 8,
      spotlightAnchorAt: utcNowIso(),
      weighInShowcase: createEmptyWeighInShowcase(),
    },
    updatedAt: "1970-01-01T00:00:00.000Z",
  });
}

function buildDemoState() {
  const demoParticipants = [
    {
      id: createId("p"),
      name: "Anna Andersson",
      team: "Produktion",
      images: createEmptyParticipantImages(),
    },
    {
      id: createId("p"),
      name: "Markus Lind",
      team: "IT",
      images: createEmptyParticipantImages(),
    },
    {
      id: createId("p"),
      name: "Sara Holm",
      team: "Inköp",
      images: createEmptyParticipantImages(),
    },
    {
      id: createId("p"),
      name: "Jonas Eriksson",
      team: "Logistik",
      images: createEmptyParticipantImages(),
    },
    {
      id: createId("p"),
      name: "Maria Sjöberg",
      team: "HR",
      images: createEmptyParticipantImages(),
    },
    {
      id: createId("p"),
      name: "Olle Bergman",
      team: "Motorlab",
      images: createEmptyParticipantImages(),
    },
  ];

  let demoState = normalizeState({
    eventName: "Odlingskampen 2026",
    eventSubtitle: "Live från företagets stora fruktvägning",
    participants: demoParticipants,
    weighIns: [],
    presentation: {
      mode: "board",
      spotlightParticipantId: demoParticipants[0].id,
      spotlightAutoplay: true,
      spotlightIntervalSec: 8,
      spotlightAnchorAt: utcNowIso(),
      weighInShowcase: createEmptyWeighInShowcase(),
    },
  });

  const startTime = Date.now() - 1000 * 60 * 18;
  const measurements = [
    [demoParticipants[0].id, 8.672],
    [demoParticipants[1].id, 7.218],
    [demoParticipants[2].id, 7.954],
    [demoParticipants[3].id, 6.884],
    [demoParticipants[4].id, 8.044],
    [demoParticipants[5].id, 9.106],
  ];

  measurements.forEach(([participantId, weightKg], index) => {
    demoState = recalculateWeighIns({
      ...demoState,
      weighIns: demoState.weighIns.concat({
        id: createId("w"),
        participantId,
        weightKg,
        measuredAt: new Date(startTime + index * 1000 * 135).toISOString(),
        previousRank: null,
        rankAfter: null,
      }),
    });
  });

  return demoState;
}

function normalizeState(rawState) {
  const input = rawState && typeof rawState === "object" ? rawState : {};
  const competitionId = sanitizeId(input.competitionId) || "comp_current";
  const competitionYear = sanitizeYear(input.competitionYear, new Date().getFullYear());
  const activeCompetitionId = sanitizeId(input.activeCompetitionId) || competitionId;
  const competitionHistory = Array.isArray(input.competitionHistory)
    ? input.competitionHistory
        .map((competition) => ({
          id: sanitizeId(competition && competition.id),
          year: sanitizeYear(competition && competition.year, competitionYear),
          eventName: sanitizeText(competition && competition.eventName, 120),
          eventSubtitle: sanitizeText(competition && competition.eventSubtitle, 140),
          participantCount: sanitizeCount(competition && competition.participantCount),
          weighedCount: sanitizeCount(competition && competition.weighedCount),
          weighInCount: sanitizeCount(competition && competition.weighInCount),
          isActive: sanitizeBoolean(competition && competition.isActive, false),
          updatedAt: sanitizeTimestamp(competition && competition.updatedAt) || utcNowIso(),
        }))
        .filter((competition) => competition.id)
    : [];

  const participants = Array.isArray(input.participants)
    ? input.participants
        .map((participant) => ({
          id: sanitizeId(participant && participant.id) || createId("p"),
          name: sanitizeText(participant && participant.name, 80),
          team: sanitizeText(participant && participant.team, 80),
          images: normalizeParticipantImages(participant && participant.images),
        }))
        .filter((participant) => participant.name)
        .filter((participant, index, collection) => collection.findIndex((entry) => entry.id === participant.id) === index)
    : [];

  const participantIds = new Set(participants.map((participant) => participant.id));
  const weighIns = Array.isArray(input.weighIns)
    ? collapseToLatestWeighIns(
        input.weighIns
        .map((weighIn) => ({
          id: sanitizeId(weighIn && weighIn.id) || createId("w"),
          participantId: sanitizeId(weighIn && weighIn.participantId),
          weightKg: sanitizeWeight(weighIn && weighIn.weightKg),
          measuredAt: sanitizeTimestamp(weighIn && weighIn.measuredAt) || utcNowIso(),
          previousRank: sanitizeRank(weighIn && weighIn.previousRank),
          rankAfter: sanitizeRank(weighIn && weighIn.rankAfter),
        }))
        .filter((weighIn) => weighIn.participantId && participantIds.has(weighIn.participantId) && weighIn.weightKg !== null)
        .filter((weighIn, index, collection) => collection.findIndex((entry) => entry.id === weighIn.id) === index)
        .sort(sortWeighInsAscending),
      )
    : [];

  return {
    version: 3,
    competitionId,
    competitionYear,
    activeCompetitionId,
    competitionHistory,
    eventName: sanitizeText(input.eventName, 120) || "Odlingskampen",
    eventSubtitle: sanitizeText(input.eventSubtitle, 140) || "Företagets live-scoreboard för fruktvägningen.",
    eventRules: sanitizeText(input.eventRules, 4000),
    participants,
    weighIns,
    presentation: normalizePresentation(input.presentation, participants),
    updatedAt: sanitizeTimestamp(input.updatedAt) || utcNowIso(),
  };
}

function collapseToLatestWeighIns(weighIns) {
  const latestByParticipant = new Map();

  weighIns.forEach((weighIn) => {
    latestByParticipant.set(weighIn.participantId, weighIn);
  });

  return Array.from(latestByParticipant.values()).sort(sortWeighInsAscending);
}

function normalizePresentation(rawPresentation, participants) {
  const input = rawPresentation && typeof rawPresentation === "object" ? rawPresentation : {};
  const fallbackParticipantId = participants.length ? participants[0].id : "";
  const matchingParticipant = participants.find((participant) => participant.id === sanitizeId(input.spotlightParticipantId));
  const spotlightParticipantId = matchingParticipant ? matchingParticipant.id : fallbackParticipantId;

  return {
    mode: input.mode === "spotlight" ? "spotlight" : "board",
    spotlightParticipantId,
    spotlightAutoplay: sanitizeBoolean(input.spotlightAutoplay, true),
    spotlightIntervalSec: sanitizeInterval(input.spotlightIntervalSec),
    spotlightAnchorAt: sanitizeTimestamp(input.spotlightAnchorAt) || utcNowIso(),
    weighInShowcase: normalizeWeighInShowcase(input.weighInShowcase, participants),
  };
}

function getParticipantImageStage(stageKey) {
  return PARTICIPANT_IMAGE_STAGES.find((stage) => stage.key === stageKey) || PARTICIPANT_IMAGE_STAGES[0];
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

function createEmptyParticipantImages() {
  return {
    sprout: createParticipantImage(),
    flower: createParticipantImage(),
    harvest: createParticipantImage(),
  };
}

function createEmptyWeighInShowcase() {
  return {
    token: "",
    participantId: "",
    phase: WEIGH_IN_SHOWCASE_PHASES.IDLE,
    finalWeightKg: null,
    startedAt: "",
  };
}

function normalizeWeighInShowcase(rawShowcase, participants) {
  const input = rawShowcase && typeof rawShowcase === "object" ? rawShowcase : {};
  const participantIds = new Set(participants.map((participant) => participant.id));
  const participantId = sanitizeId(input.participantId);
  const phase = Object.values(WEIGH_IN_SHOWCASE_PHASES).includes(input.phase) ? input.phase : WEIGH_IN_SHOWCASE_PHASES.IDLE;
  const startedAt = sanitizeTimestamp(input.startedAt) || "";
  const finalWeightKg = sanitizeWeight(input.finalWeightKg);
  const startedAtMs = startedAt ? Date.parse(startedAt) : Number.NaN;

  if (!participantId || !participantIds.has(participantId)) {
    return createEmptyWeighInShowcase();
  }

  if (phase === WEIGH_IN_SHOWCASE_PHASES.INTRO) {
    return {
      token: sanitizeId(input.token) || createId("seq"),
      participantId,
      phase,
      finalWeightKg: null,
      startedAt: startedAt || utcNowIso(),
    };
  }

  if (phase === WEIGH_IN_SHOWCASE_PHASES.COUNTUP && finalWeightKg !== null) {
    if (Number.isFinite(startedAtMs) && Date.now() - startedAtMs > WEIGH_IN_SHOWCASE_STALE_COUNTUP_MS) {
      return createEmptyWeighInShowcase();
    }

    return {
      token: sanitizeId(input.token) || createId("seq"),
      participantId,
      phase,
      finalWeightKg,
      startedAt: startedAt || utcNowIso(),
    };
  }

  return createEmptyWeighInShowcase();
}

function getActiveWeighInShowcase(presentationState = state.presentation) {
  return normalizeWeighInShowcase(presentationState && presentationState.weighInShowcase, state.participants);
}

function normalizeParticipantImages(rawImages) {
  const images = rawImages && typeof rawImages === "object" ? rawImages : {};
  return {
    sprout: normalizeParticipantImage(images.sprout),
    flower: normalizeParticipantImage(images.flower),
    harvest: normalizeParticipantImage(images.harvest),
  };
}

function hasParticipantImage(rawImage) {
  return Boolean(normalizeParticipantImage(rawImage).path);
}

function getParticipantImageSignature(rawImage) {
  const image = normalizeParticipantImage(rawImage);
  return image.path ? `${image.path}@${image.positionX},${image.positionY},${image.scale}` : "";
}

function buildParticipantImageStyle(rawImage) {
  const image = normalizeParticipantImage(rawImage);
  return `--image-offset-x: ${image.positionX}%; --image-offset-y: ${image.positionY}%; --image-scale: ${image.scale};`;
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

function loadCachedState() {
  try {
    const rawValue = window.localStorage.getItem(STORAGE_KEY);
    return rawValue ? normalizeState(JSON.parse(rawValue)) : createDefaultState();
  } catch (error) {
    console.warn("Kunde inte läsa lokalt sparad tävlingsdata.", error);
    return createDefaultState();
  }
}

function saveCachedState(nextState) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
  } catch (error) {
    console.warn("Kunde inte spara tävlingsdata lokalt.", error);
  }
}

function broadcastState(nextState) {
  if (runtime.channel) {
    runtime.channel.postMessage(nextState);
  }
}

function isIncomingStateNewer(incomingState, currentState) {
  return Date.parse(incomingState.updatedAt) > Date.parse(currentState.updatedAt);
}

function notify(message) {
  dom.globalNotice.textContent = message;
  dom.globalNotice.classList.add("is-visible");
  window.clearTimeout(runtime.noticeHandle);
  runtime.noticeHandle = window.setTimeout(() => {
    dom.globalNotice.textContent = "";
    dom.globalNotice.classList.remove("is-visible");
  }, 4200);
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

function syncInputValue(input, value) {
  if (document.activeElement !== input) {
    input.value = value;
  }
}

function syncSelectValue(select, value) {
  if (Array.from(select.options).some((option) => option.value === value)) {
    select.value = value;
  }
}

function setToggleState(button, isActive) {
  button.classList.toggle("is-active", isActive);
  button.setAttribute("aria-pressed", String(isActive));
}

function wait(durationMs) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, durationMs);
  });
}

function nextFrame() {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

function triggerTransientClass(element, className, durationMs) {
  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);
  window.setTimeout(() => {
    element.classList.remove(className);
  }, durationMs);
}

function openDisplayWindow() {
  window.open(buildViewUrl("board"), "_blank", "noopener,noreferrer");
}

async function logoutSession() {
  if (!isHttpMode()) {
    window.localStorage.removeItem(STORAGE_KEY);
    return;
  }

  try {
    await fetch("/api/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
  } catch {}

  window.localStorage.removeItem(STORAGE_KEY);
}

function buildViewUrl(view) {
  const url = new URL(window.location.href);
  url.searchParams.set("view", view);
  return url.toString();
}

function redirectToLogin() {
  const nextPath = `${window.location.pathname}${window.location.search}`;
  window.location.assign(`/login?next=${encodeURIComponent(nextPath)}`);
}

function participantKey(name, team) {
  const safeName = sanitizeText(name, 80).toLowerCase();
  const safeTeam = sanitizeText(team, 80).toLowerCase();
  return safeName ? `${safeName}|${safeTeam}` : "";
}

function buildParticipantLoginUsernameMap(participants, overrideParticipantId = "", overrideName = "") {
  const usernameMap = new Map();
  const seenCounts = new Map();

  participants.forEach((participant) => {
    const participantId = sanitizeId(participant && participant.id);
    if (!participantId) {
      return;
    }

    const candidateName =
      participantId === overrideParticipantId ? sanitizeText(overrideName, 80) || participant.name : participant.name;
    const baseUsername = formatParticipantLoginUsername(candidateName);
    const seenKey = baseUsername.toLocaleLowerCase("sv-SE");
    const nextCount = (seenCounts.get(seenKey) || 0) + 1;
    seenCounts.set(seenKey, nextCount);
    usernameMap.set(participantId, nextCount === 1 ? baseUsername : `${baseUsername}.${nextCount}`);
  });

  return usernameMap;
}

function buildParticipantLoginUsername(name, participantId = "") {
  if (!participantId) {
    return formatParticipantLoginUsername(name);
  }
  return buildParticipantLoginUsernameMap(state.participants, participantId, name).get(participantId) || "Deltagare";
}

function formatParticipantLoginUsername(name) {
  const safeName = sanitizeText(name, 80)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const tokens = safeName.split(/[^A-Za-z0-9]+/).filter(Boolean);
  if (!tokens.length) {
    return "Deltagare";
  }
  return tokens.map((token) => `${token.charAt(0).toUpperCase()}${token.slice(1)}`).join(".").slice(0, 80);
}

function findDuplicateParticipant(name, team, excludedParticipantId = "") {
  return (
    state.participants.find((participant) => {
      if (excludedParticipantId && participant.id === excludedParticipantId) {
        return false;
      }
      return participantKey(participant.name, participant.team) === participantKey(name, team);
    }) || null
  );
}

function countParticipantImages(participant) {
  return Object.values(participant.images || {}).filter(Boolean).length;
}

function describeMovement(weighIn) {
  if (weighIn.rankAfter === 1 && weighIn.previousRank !== 1) return "Tog över förstaplatsen";
  if (weighIn.previousRank === null && weighIn.rankAfter !== null) return `Gick direkt in på plats ${weighIn.rankAfter}`;
  if (weighIn.rankAfter !== null && weighIn.previousRank !== null && weighIn.rankAfter < weighIn.previousRank) {
    return `Klättrade från plats ${weighIn.previousRank} till ${weighIn.rankAfter}`;
  }
  if (weighIn.rankAfter !== null && weighIn.previousRank !== null && weighIn.rankAfter > weighIn.previousRank) {
    return `Föll från plats ${weighIn.previousRank} till ${weighIn.rankAfter}`;
  }
  return weighIn.rankAfter !== null ? `Ligger kvar på plats ${weighIn.rankAfter}` : "Registrerad";
}

function getRankMap(rankedEntries) {
  return new Map(rankedEntries.map((entry) => [entry.id, entry.rank]));
}

function formatWeight(weightKg) {
  return `${Number(weightKg).toFixed(3).replace(".", ",")} kg`;
}

function formatWeightInput(weightKg) {
  return Number(weightKg).toFixed(3).replace(".", ",");
}

function formatDateTime(value) {
  return dateTimeFormatter.format(new Date(value));
}

function normalizeWeightInput(rawValue) {
  const parsed = Number.parseFloat(String(rawValue).replace(",", "."));
  return sanitizeWeight(parsed);
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

function sanitizeInterval(value) {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? Math.min(30, Math.max(5, parsed)) : 8;
}

function sanitizeBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const lowered = value.trim().toLowerCase();
    if (lowered === "true") return true;
    if (lowered === "false") return false;
  }
  if (typeof value === "number") return value !== 0;
  return fallback;
}

function sortWeighInsAscending(left, right) {
  const leftTime = Date.parse(left.measuredAt);
  const rightTime = Date.parse(right.measuredAt);
  return leftTime !== rightTime ? leftTime - rightTime : left.id.localeCompare(right.id, "sv-SE");
}

function sortWeighInsDescending(left, right) {
  return sortWeighInsAscending(right, left);
}

function modulo(value, max) {
  return ((value % max) + max) % max;
}

function shortenText(value, maxLength) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}...` : value;
}

function createId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function utcNowIso() {
  return new Date().toISOString();
}

function isHttpMode() {
  return window.location.protocol === "http:" || window.location.protocol === "https:";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
