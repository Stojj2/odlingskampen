const POLL_INTERVAL_MS = 4000;

const PARTICIPANT_IMAGE_STAGES = [
  { key: "sprout", label: "Första planta", emptyLabel: "Ingen bild för den första plantan än." },
  { key: "flower", label: "Första blomman", emptyLabel: "Ingen bild för pollinerad blomma än." },
  { key: "harvest", label: "Skördad frukt", emptyLabel: "Ingen bild på skördad frukt än." },
];

const USE_CUSTOM_DROPDOWNS = false;

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
  isUpdatingCompetitionSelect: false,
};

let context = null;
const CONTROL_EVENTS = ["input", "change", "tdsInput", "tdsChange"];

document.addEventListener("DOMContentLoaded", async () => {
  cacheDom();
  bindEvents();
  await syncFromServer({ allowFallbackNotice: false });
});

function cacheDom() {
  dom.menuToggleButton = document.getElementById("participant-menu-toggle-btn");
  dom.topbarMenu = document.getElementById("participant-mobile-menu");
  dom.topbarMenuOverlay = dom.topbarMenu?.querySelector('tds-side-menu-overlay[slot="overlay"]') || null;
  dom.topbarMenuCloseButton = dom.topbarMenu?.querySelector('tds-side-menu-close-button[slot="close-button"]') || null;
  dom.syncStatus = document.getElementById("participant-sync-status");
  dom.rulesOpenButtons = [
    document.getElementById("participant-rules-open-btn"),
    document.getElementById("participant-rules-open-btn-mobile"),
  ].filter(Boolean);
  dom.passwordOpenButtons = [
    document.getElementById("participant-password-open-btn"),
    document.getElementById("participant-password-open-btn-mobile"),
  ].filter(Boolean);
  dom.logoutButtons = [
    document.getElementById("participant-logout-btn"),
    document.getElementById("participant-logout-btn-mobile"),
  ].filter(Boolean);
  dom.notice = document.getElementById("participant-notice");
  dom.pageName = document.getElementById("participant-page-name");
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
  dom.passwordCancelButton = document.getElementById("participant-password-cancel-btn");
  dom.rulesDialog = document.getElementById("participant-rules-dialog");
  dom.rulesTitle = document.getElementById("participant-rules-title");
  dom.rulesCopy = document.getElementById("participant-rules-copy");
  dom.rulesCloseButton = document.getElementById("participant-rules-close-btn");
  dom.competitionSelect = document.getElementById("participant-competition-select");
  dom.competitionCopy = document.getElementById("participant-competition-copy");
  dom.standingsTableBody = document.getElementById("participant-standings-table-body");
  dom.standingsImageDialog = document.getElementById("participant-standings-image-dialog");
  dom.standingsImageDialogPreview = document.getElementById("participant-standings-image-preview");
  dom.standingsImageDialogEmpty = document.getElementById("participant-standings-image-empty");
  dom.standingsImageDialogCloseButton = document.getElementById("participant-standings-image-close-btn");
  dom.participantNavLinks = Array.from(document.querySelectorAll("[data-participant-link]"));
  dom.participantNavTargets = [
    { id: "participant-view-profile-btn", href: "/participant.html" },
    { id: "participant-view-standings-btn", href: "/participant-standings.html" },
    { id: "participant-view-profile-btn-mobile", href: "/participant.html" },
    { id: "participant-view-standings-btn-mobile", href: "/participant-standings.html" },
  ]
    .map((entry) => ({ ...entry, element: document.getElementById(entry.id) }))
    .filter((entry) => entry.element);
  dom.stageInputs = new Map(
    Array.from(document.querySelectorAll("[data-stage-input]")).map((element) => [element.dataset.stageInput, element]),
  );
  dom.stageUploadButtons = new Map(
    Array.from(document.querySelectorAll("[data-stage-upload]")).map((element) => [element.dataset.stageUpload, element]),
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
  dom.imageAdjustEmpty = document.getElementById("image-adjust-empty");
  dom.imageAdjustWorkspaceShell = document.getElementById("image-adjust-workspace-shell");
  dom.imageAdjustScale = document.getElementById("image-adjust-scale");

  dom.imageAdjustOffsetX = document.getElementById("image-adjust-offset-x");
  dom.imageAdjustOffsetY = document.getElementById("image-adjust-offset-y");
  dom.imageAdjustCancelButton = document.getElementById("image-adjust-cancel-btn");
  dom.imageAdjustSaveButton = document.getElementById("image-adjust-save-btn");
}

function setMobileMenuOpen(isOpen) {
  if (!dom.menuToggleButton || !dom.topbarMenu) {
    return;
  }

  dom.menuToggleButton.setAttribute("aria-expanded", String(isOpen));
  dom.topbarMenu.open = Boolean(isOpen);
  if (isOpen) {
    dom.topbarMenu.setAttribute("open", "");
  } else {
    dom.topbarMenu.removeAttribute("open");
  }
}

function bindParticipantNavigation() {
  dom.participantNavLinks.forEach((button) => {
    button.addEventListener("click", () => {
      const target = button.dataset.participantLink;
      if (target) {
        window.location.href = target;
      }
      setMobileMenuOpen(false);
    });
  });

  dom.participantNavTargets.forEach((entry) => {
    entry.element.addEventListener(
      "click",
      (event) => {
        event.preventDefault();
        window.location.href = entry.href;
        setMobileMenuOpen(false);
      },
      { capture: true },
    );
  });
}

function bindEvents() {
  bindParticipantNavigation();

  dom.passwordOpenButtons.forEach((button) => button.addEventListener("click", openPasswordDialog));

  dom.rulesOpenButtons.forEach((button) => button.addEventListener("click", openRulesDialog));

  dom.logoutButtons.forEach((button) =>
    button.addEventListener("click", async () => {
      await logoutSession();
      redirectToLogin();
    }),
  );

  if (dom.menuToggleButton) {
    dom.menuToggleButton.addEventListener("click", () => {
      const isOpen = dom.menuToggleButton.getAttribute("aria-expanded") === "true";
      setMobileMenuOpen(!isOpen);
    });
  }

  [dom.topbarMenuOverlay, dom.topbarMenuCloseButton].forEach((element) => {
    element?.addEventListener("click", () => {
      setMobileMenuOpen(false);
    });
  });

  dom.topbarMenu?.addEventListener("click", (event) => {
    const target = event.target;
    if (target instanceof Element && target.closest("tds-side-menu-close-button, tds-side-menu-overlay")) {
      setMobileMenuOpen(false);
    }
  });

  document.addEventListener("click", (event) => {
    if (!dom.menuToggleButton || !dom.topbarMenu) {
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

  if (USE_CUSTOM_DROPDOWNS) {
    document.addEventListener("click", (event) => {
      const path = typeof event.composedPath === "function" ? event.composedPath() : [];
      const option = path.find((node) => node instanceof Element && node.tagName === "TDS-DROPDOWN-OPTION");
      if (!option) {
        return;
      }

      const dropdown =
        option?.closest?.("tds-dropdown") ||
        path.find((node) => node instanceof Element && node.tagName === "TDS-DROPDOWN");

      if (!dropdown) {
        return;
      }

      window.setTimeout(() => {
        closeDropdownElement(dropdown);
      }, 0);
    });

    document.addEventListener("click", (event) => {
      const path = typeof event.composedPath === "function" ? event.composedPath() : [];
      const clickedInsideDropdown = path.some((node) => {
        if (!(node instanceof Element)) {
          return false;
        }
        if (node.tagName === "TDS-DROPDOWN" || node.tagName === "TDS-DROPDOWN-OPTION") {
          return true;
        }
        return node.classList?.contains("dropdown-list");
      });
      if (!clickedInsideDropdown) {
        closeDropdownElement(dom.competitionSelect);
      }
    });
  }

  if (USE_CUSTOM_DROPDOWNS) {
    bindDropdownPositioning(dom.competitionSelect);

    window.addEventListener(
      "resize",
      () => {
        positionDropdownList(dom.competitionSelect);
      },
      { passive: true },
    );

    window.addEventListener(
      "scroll",
      () => {
        positionDropdownList(dom.competitionSelect);
      },
      { passive: true, capture: true },
    );
  }

  window.addEventListener("resize", () => {
    if (window.innerWidth > 900) {
      setMobileMenuOpen(false);
    }
  });

  if (dom.passwordForm) {
    dom.passwordForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const currentPassword = getControlValue(dom.currentPassword).trim();
    const newPassword = getControlValue(dom.newPassword).trim();
    const confirmPassword = getControlValue(dom.confirmPassword).trim();

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
      setControlDisabled(dom.passwordSaveButton, true);
      await persistParticipantPasswordChange(currentPassword, newPassword);
      dom.passwordForm.reset();
      closePasswordDialog();
      notify("Ditt lösenord är uppdaterat.");
    } catch (error) {
      console.warn("Kunde inte byta deltagarlösenord.", error);
      notify(error instanceof Error ? error.message : "Det gick inte att byta lösenord.");
    } finally {
      setControlDisabled(dom.passwordSaveButton, false);
    }
    });
  }

  if (dom.competitionSelect) {
    const handleCompetitionChange = async () => {
      if (runtime.isUpdatingCompetitionSelect) {
        return;
      }

      const nextCompetitionId = sanitizeId(getControlValue(dom.competitionSelect));
      if (!nextCompetitionId || nextCompetitionId === runtime.selectedCompetitionId) {
        return;
      }

      runtime.selectedCompetitionId = nextCompetitionId;
      await syncFromServer({ allowFallbackNotice: false, competitionId: runtime.selectedCompetitionId });
      window.setTimeout(() => closeDropdownElement(dom.competitionSelect), 0);
    };

    dom.competitionSelect.addEventListener("change", handleCompetitionChange);
    dom.competitionSelect.addEventListener("tdsChange", handleCompetitionChange);
  }

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

  dom.stageUploadButtons.forEach((button, stageKey) => {
    button.addEventListener("click", () => {
      const input = dom.stageInputs.get(stageKey);
      input?.click();
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

  bindControlEvents(dom.imageAdjustScale, syncImageAdjustPreviewFromControls);
  bindControlEvents(dom.imageAdjustOffsetX, syncImageAdjustPreviewFromControls);
  bindControlEvents(dom.imageAdjustOffsetY, syncImageAdjustPreviewFromControls);

  if (dom.imageAdjustCancelButton) {
    dom.imageAdjustCancelButton.addEventListener("click", closeImageAdjustDialog);
  }

  if (dom.imageAdjustSaveButton) {
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

  if (dom.passwordCancelButton) {
    dom.passwordCancelButton.addEventListener("click", closePasswordDialog);
  }

  if (dom.rulesCloseButton) {
    dom.rulesCloseButton.addEventListener("click", closeRulesDialog);
  }
  bindStandingsEvents();
  bindModalCloseEvents(dom.passwordDialog, resetPasswordForm);
  bindModalCloseEvents(dom.rulesDialog);
  bindModalCloseEvents(dom.standingsImageDialog, resetStandingsImageDialog);
  bindModalCloseEvents(dom.imageAdjustDialog, () => {
    runtime.imageAdjustSession = null;
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      syncFromServer({ competitionId: runtime.selectedCompetitionId });
    }
  });
}

function bindStandingsEvents() {
  if (!dom.standingsTableBody) {
    return;
  }

  dom.standingsTableBody.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const path = typeof event.composedPath === "function" ? event.composedPath() : [];
    if (!target) {
      return;
    }

    const imageButton = target.closest(".participant-standings-image-button");
    if (imageButton) {
      event.preventDefault();
      event.stopPropagation();
      openStandingsImageDialog(imageButton);
      return;
    }

    if (target.closest(".participant-standings-expand")) {
      return;
    }

    const clickedExpandControl = path.some((node) => {
      if (!(node instanceof HTMLElement)) {
        return false;
      }
      return (
        node.tagName === "LABEL" ||
        node.tagName === "INPUT" ||
        node.classList.contains("tds-table__cell-expand")
      );
    });

    if (clickedExpandControl) {
      return;
    }

    const expandableRow = findExpandableRowFromEvent(event);
    if (!expandableRow) {
      return;
    }

    if (target.closest("button, a, input, label")) {
      return;
    }

    toggleExpandableRow(expandableRow);
  });

  dom.standingsImageDialogCloseButton?.addEventListener("click", closeStandingsImageDialog);
}

function findExpandableRowFromEvent(event) {
  const path = typeof event.composedPath === "function" ? event.composedPath() : [];
  return path.find((node) => node instanceof HTMLElement && node.tagName === "TDS-TABLE-BODY-ROW-EXPANDABLE") || null;
}

function toggleExpandableRow(expandableRow) {
  if (!(expandableRow instanceof HTMLElement)) {
    return;
  }

  const shadowRoot = expandableRow.shadowRoot;
  const toggleControl =
    shadowRoot?.querySelector('label[for], .tds-table__row--expand label, label') ||
    shadowRoot?.querySelector('input[type="checkbox"]');

  if (toggleControl instanceof HTMLElement) {
    toggleControl.click();
  }
}

function openStandingsImageDialog(trigger) {
  if (!dom.standingsImageDialog || !dom.standingsImageDialogPreview || !dom.standingsImageDialogEmpty) {
    return;
  }

  const imagePath = sanitizeImagePath(trigger.getAttribute("data-image-path"));
  const participantName = sanitizeText(trigger.getAttribute("data-image-participant"), 80);
  const stageLabel = sanitizeText(trigger.getAttribute("data-image-stage"), 80);
  const positionX = sanitizeImageOffset(trigger.getAttribute("data-image-position-x"));
  const positionY = sanitizeImageOffset(trigger.getAttribute("data-image-position-y"));
  const scale = sanitizeImageScale(trigger.getAttribute("data-image-scale"));

  if (imagePath) {
    dom.standingsImageDialogPreview.hidden = false;
    dom.standingsImageDialogEmpty.hidden = true;
    dom.standingsImageDialogPreview.src = imagePath;
    dom.standingsImageDialogPreview.alt = participantName && stageLabel ? `${participantName} - ${stageLabel}` : "Deltagarbild";
    dom.standingsImageDialogPreview.style.removeProperty("--image-offset-x");
    dom.standingsImageDialogPreview.style.removeProperty("--image-offset-y");
    dom.standingsImageDialogPreview.style.removeProperty("--image-scale");
  } else {
    dom.standingsImageDialogPreview.hidden = true;
    dom.standingsImageDialogPreview.removeAttribute("src");
    dom.standingsImageDialogEmpty.hidden = false;
  }

  openModalElement(dom.standingsImageDialog);
}

function closeStandingsImageDialog() {
  const internalCloseButton = dom.standingsImageDialog?.shadowRoot?.querySelector(".tds-modal-close");
  if (internalCloseButton instanceof HTMLElement) {
    internalCloseButton.click();
    return;
  }

  closeModalElement(dom.standingsImageDialog);
}

function resetStandingsImageDialog() {
  if (dom.standingsImageDialogPreview instanceof HTMLImageElement) {
    dom.standingsImageDialogPreview.hidden = true;
    dom.standingsImageDialogPreview.removeAttribute("src");
    dom.standingsImageDialogPreview.removeAttribute("alt");
  }
  if (dom.standingsImageDialogEmpty instanceof HTMLElement) {
    dom.standingsImageDialogEmpty.hidden = false;
  }
}

function openPasswordDialog() {
  if (!dom.passwordDialog) {
    return;
  }

  setMobileMenuOpen(false);
  openModalElement(dom.passwordDialog);
  window.setTimeout(() => {
    dom.currentPassword?.focus?.();
  }, 0);
}

function closePasswordDialog() {
  closeModalElement(dom.passwordDialog);
  resetPasswordForm();
}

function openRulesDialog() {
  if (!dom.rulesDialog) {
    return;
  }

  renderRulesDialog();
  setMobileMenuOpen(false);
  openModalElement(dom.rulesDialog);
}

function closeRulesDialog() {
  closeModalElement(dom.rulesDialog);
}

function resetPasswordForm() {
  if (!(dom.passwordForm instanceof HTMLFormElement)) {
    return;
  }

  dom.passwordForm.reset();
  setControlDisabled(dom.passwordSaveButton, false);
}

function startPolling() {
  window.clearInterval(runtime.pollHandle);
  runtime.pollHandle = null;
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
  tightenStandingsTableLayout();
  window.setTimeout(tightenStandingsTableLayout, 0);
  window.setTimeout(tightenStandingsTableLayout, 80);
  window.setTimeout(tightenStandingsTableLayout, 220);
}

function renderProfile() {
  if (!dom.pageName || !dom.pageTeam) {
    return;
  }
  if (!context || !context.participant) {
    dom.pageName.textContent = "Deltagare saknas";
    if (dom.pageLogin instanceof HTMLElement) {
      dom.pageLogin.textContent = "Kunde inte läsa in deltagardata.";
    }
    dom.pageTeam.textContent = "-";
    setProfileMetricVisibility(false, false);
    return;
  }

  const participant = context.participant;
  const hasRank = Number.isFinite(participant.rank) && participant.rank > 0;
  const hasWeight = typeof participant.weightKg === "number" && Number.isFinite(participant.weightKg);
  dom.pageName.textContent = participant.name || "Deltagare";
  if (dom.pageLogin instanceof HTMLElement) {
    dom.pageLogin.textContent = participant.username
      ? `Ditt inloggningsnamn är ${participant.username}.`
      : "Inloggningsnamn saknas.";
  }
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
  if (!dom.stageInputs || dom.stageInputs.size === 0) {
    return;
  }
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
    const status = dom.stageStatus.get(stage.key) || { textContent: "" };

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
  if (!dom.imageAdjustDialog || !context || !context.participant) {
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
    dom.imageAdjustCopy.textContent = "";
  }

  syncImageAdjustControls(image);
  renderImageAdjustPreview(image, context.participant.name, stageLabel);

  openModalElement(dom.imageAdjustDialog);
}

function syncImageAdjustControls(imageValue) {
  const image = normalizeParticipantImage(imageValue);
  setControlValue(dom.imageAdjustScale, String(image.scale));
  setControlValue(dom.imageAdjustOffsetX, String(image.positionX));
  setControlValue(dom.imageAdjustOffsetY, String(image.positionY));
}

function syncImageAdjustPreviewFromControls() {
  if (!runtime.imageAdjustSession) {
    return;
  }

  const nextImage = createParticipantImage(
    runtime.imageAdjustSession.image.path,
    getControlValue(dom.imageAdjustOffsetX) || runtime.imageAdjustSession.image.positionX,
    getControlValue(dom.imageAdjustOffsetY) || runtime.imageAdjustSession.image.positionY,
    getControlValue(dom.imageAdjustScale) || runtime.imageAdjustSession.image.scale,
  );
  updateImageAdjustSessionImage(nextImage);
}

function renderImageAdjustPreview(imageValue, participantName, stageLabel) {
  const image = normalizeParticipantImage(imageValue);
  if (
    !(dom.imageAdjustPreview instanceof HTMLImageElement) ||
    !(dom.imageAdjustEmpty instanceof HTMLElement)
  ) {
    return;
  }

  const hasImage = Boolean(image.path);
  dom.imageAdjustPreview.hidden = !hasImage;
  dom.imageAdjustEmpty.hidden = hasImage;
  dom.imageAdjustPreview.alt = participantName ? `${participantName} - ${stageLabel}` : stageLabel;
  dom.imageAdjustPreview.src = image.path || "";
  applyParticipantImageStyle(dom.imageAdjustPreview, image);
}

function closeImageAdjustDialog() {
  setImageAdjustDragging(false);
  runtime.imageAdjustSession = null;
  closeModalElement(dom.imageAdjustDialog);
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
  if (!dom.competitionSelect || !dom.competitionCopy) {
    return;
  }
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

  dom.competitionCopy.textContent = "";
}

function renderRulesDialog() {
  if (!dom.rulesTitle || !dom.rulesCopy) {
    return;
  }
  const selectedCompetition = context && context.selectedCompetition ? context.selectedCompetition : null;
  const competitionName = selectedCompetition && selectedCompetition.eventName ? selectedCompetition.eventName : "Tävlingen";
  const rulesText =
    selectedCompetition && typeof selectedCompetition.eventRules === "string" ? selectedCompetition.eventRules.trim() : "";

  if (dom.rulesTitle instanceof HTMLElement) {
    dom.rulesTitle.textContent = `Regler för ${competitionName}`;
  }

  if (dom.rulesCopy instanceof HTMLElement) {
    dom.rulesCopy.textContent = rulesText || "Inga regler är inlagda för den här tävlingen ännu.";
    dom.rulesCopy.classList.toggle("is-empty", !rulesText);
  }
}

function renderStandings() {
  if (!dom.standingsTableBody) {
    return;
  }

  if (!context || !Array.isArray(context.standings) || !context.standings.length) {
    dom.standingsTableBody.innerHTML = `
      <tds-table-body-row>
        <tds-body-cell></tds-body-cell>
        <tds-body-cell>Inga resultat att visa an.</tds-body-cell>
        <tds-body-cell></tds-body-cell>
        <tds-body-cell></tds-body-cell>
        <tds-body-cell></tds-body-cell>
      </tds-table-body-row>
    `;
    return;
  }

  dom.standingsTableBody.innerHTML = context.standings
    .map((entry) => {
      const weightText = entry.hasWeight ? formatWeight(entry.weightKg) : "Ingen vikt an";
      const rankText = entry.rank ? String(entry.rank) : "-";
      return `
        <tds-table-body-row-expandable
          class="${entry.isSelf ? "is-self" : ""}"
          col-span="5"
          overflow="visible"
          auto-collapse="true"
          tds-aria-label-expand-button="Visa bilder for ${escapeHtml(entry.name)}"
        >
          <tds-body-cell>${escapeHtml(rankText)}</tds-body-cell>
          <tds-body-cell>${escapeHtml(entry.name)}</tds-body-cell>
          <tds-body-cell>${escapeHtml(entry.team || "Ingen avdelning")}</tds-body-cell>
          <tds-body-cell>${escapeHtml(weightText)}</tds-body-cell>
          <div slot="expand-row" class="participant-standings-expand">${renderStandingsExpandedImages(entry)}</div>
        </tds-table-body-row-expandable>
      `;
    })
    .join("");
}

function tightenStandingsTableLayout() {
  const table = document.getElementById("participant-standings-table");
  if (!(table instanceof HTMLElement)) {
    return;
  }

  const isMobile = window.innerWidth <= 720;
  const horizontalPadding = "4px";
  const verticalPadding = isMobile ? "8px" : "8px";
  const tableWidth = table.getBoundingClientRect().width || table.clientWidth || 0;
  const expandWidth = isMobile ? 28 : 32;
  const rankWidth = isMobile ? 28 : null;
  const weightWidth = isMobile ? 84 : null;
  const remainingWidth =
    isMobile && tableWidth
      ? Math.max(160, Math.round(tableWidth - expandWidth - rankWidth - weightWidth))
      : null;
  const nameWidth = isMobile && remainingWidth ? Math.round(remainingWidth * 0.56) : null;
  const departmentWidth = isMobile && remainingWidth ? Math.max(72, remainingWidth - nameWidth) : null;
  const mobileHeaderWidths = isMobile
    ? [
        expandWidth ? `${expandWidth}px` : "",
        rankWidth ? `${rankWidth}px` : "",
        nameWidth ? `${nameWidth}px` : "",
        departmentWidth ? `${departmentWidth}px` : "",
        weightWidth ? `${weightWidth}px` : "",
      ]
    : null;
  const mobileBodyWidths = isMobile
    ? [
        rankWidth ? `${rankWidth}px` : "",
        nameWidth ? `${nameWidth}px` : "",
        departmentWidth ? `${departmentWidth}px` : "",
        weightWidth ? `${weightWidth}px` : "",
      ]
    : null;

  const tableHeader = table.querySelector("tds-table-header");
  if (tableHeader instanceof HTMLElement) {
    tableHeader.style.width = "100%";
    tableHeader.style.minWidth = isMobile ? "100%" : "";
  }

  const tableBody = table.querySelector("tds-table-body");
  if (tableBody instanceof HTMLElement) {
    tableBody.style.width = "100%";
    tableBody.style.minWidth = isMobile ? "100%" : "";
  }

  const headerCells = Array.from(table.querySelectorAll("tds-header-cell"));
  headerCells.forEach((cell, index) => {
    if (!(cell instanceof HTMLElement) || !cell.shadowRoot) {
      return;
    }

    const th = cell.shadowRoot.querySelector("th");
    if (th instanceof HTMLElement) {
      th.style.paddingLeft = horizontalPadding;
      th.style.paddingRight = horizontalPadding;
      th.style.paddingTop = verticalPadding;
      th.style.paddingBottom = verticalPadding;
      th.style.textAlign = "left";
      th.style.verticalAlign = "middle";
        th.style.justifyContent = "flex-start";
        if (index === 0) {
          th.style.paddingLeft = "0";
          th.style.paddingRight = "0";
        }
        th.style.width = isMobile && mobileHeaderWidths ? mobileHeaderWidths[index] || "" : "";
        th.style.minWidth = isMobile && mobileHeaderWidths ? mobileHeaderWidths[index] || "" : "";
        th.style.maxWidth = isMobile && mobileHeaderWidths ? mobileHeaderWidths[index] || "" : "";
      }

      const headerText = cell.shadowRoot.querySelector(".tds-table__header-text");
      if (headerText instanceof HTMLElement) {
        headerText.style.margin = "0";
      headerText.style.paddingLeft = "0";
      headerText.style.paddingRight = "0";
      headerText.style.textAlign = "left";
    }
  });

  const bodyCells = Array.from(table.querySelectorAll("tds-body-cell"));
  bodyCells.forEach((cell, index) => {
    if (!(cell instanceof HTMLElement) || !cell.shadowRoot) {
      return;
    }

    const td = cell.shadowRoot.querySelector("td");
      if (td instanceof HTMLElement) {
        td.style.paddingLeft = horizontalPadding;
        td.style.paddingRight = horizontalPadding;
        td.style.paddingTop = verticalPadding;
        td.style.paddingBottom = verticalPadding;
        td.style.textAlign = "left";
        td.style.verticalAlign = "middle";
        if (isMobile && mobileBodyWidths) {
          const columnIndex = index % 4;
          const width = mobileBodyWidths[columnIndex] || "";
          td.style.width = width;
          td.style.minWidth = width;
          td.style.maxWidth = width;
        } else {
          td.style.width = "";
          td.style.minWidth = "";
          td.style.maxWidth = "";
        }

        if (index % 4 === 3) {
          td.style.whiteSpace = "nowrap";
        }
      }
  });

    const expandableRows = Array.from(table.querySelectorAll("tds-table-body-row-expandable"));
    expandableRows.forEach((row) => {
      if (!(row instanceof HTMLElement) || !row.shadowRoot) {
        return;
      }

      const expandCell = row.shadowRoot.querySelector(".tds-table__row-expand td");
      if (expandCell instanceof HTMLElement) {
        expandCell.style.paddingLeft = horizontalPadding;
        expandCell.style.paddingRight = horizontalPadding;
        if (expandWidth) {
          expandCell.style.width = `${tableWidth}px`;
        }
      }

      const expandToggleCell = row.shadowRoot.querySelector(".tds-table__cell-expand");
      if (expandToggleCell instanceof HTMLElement && expandWidth) {
        expandToggleCell.style.width = `${expandWidth}px`;
        expandToggleCell.style.minWidth = `${expandWidth}px`;
        expandToggleCell.style.maxWidth = `${expandWidth}px`;
        expandToggleCell.style.padding = "0";
        expandToggleCell.style.display = "flex";
        expandToggleCell.style.alignItems = "center";
        expandToggleCell.style.justifyContent = "center";
        expandToggleCell.style.height = "100%";
        expandToggleCell.style.minHeight = isMobile ? "33px" : "33px";
        expandToggleCell.style.textAlign = "center";
      }

      const expandControl = row.shadowRoot.querySelector(".tds-table__expand-control-container");
      if (expandControl instanceof HTMLElement) {
        expandControl.style.display = "flex";
        expandControl.style.alignItems = "center";
        expandControl.style.justifyContent = "center";
        expandControl.style.width = "100%";
        expandControl.style.height = "100%";
        expandControl.style.minHeight = "100%";
        expandControl.style.padding = "0";
        expandControl.style.margin = "0";
      }

      const expandIconShell = row.shadowRoot.querySelector(".tds-expendable-row-icon");
      if (expandIconShell instanceof HTMLElement) {
        expandIconShell.style.display = "flex";
        expandIconShell.style.alignItems = "center";
        expandIconShell.style.justifyContent = "center";
        expandIconShell.style.width = isMobile ? "14px" : "16px";
        expandIconShell.style.height = isMobile ? "14px" : "16px";
        expandIconShell.style.margin = "0 auto";
      }

      const expandIcon = row.shadowRoot.querySelector(".tds-table__cell-expand svg");
      if (expandIcon instanceof SVGElement) {
        const iconSize = isMobile ? "14" : "16";
        expandIcon.setAttribute("width", iconSize);
        expandIcon.setAttribute("height", iconSize);
        expandIcon.style.width = `${iconSize}px`;
        expandIcon.style.height = `${iconSize}px`;
        expandIcon.style.display = "block";
        expandIcon.style.flex = "0 0 auto";
      }
    });
  }

function renderStandingsLegacyCustom() {
  if (!dom.standingsTableBody) {
    return;
  }

  if (!context || !Array.isArray(context.standings) || !context.standings.length) {
    dom.standingsTableBody.innerHTML = `
      <tds-table-body-row>
        <tds-body-cell></tds-body-cell>
        <tds-body-cell>Inga placeringar är registrerade än.</tds-body-cell>
        <tds-body-cell></tds-body-cell>
        <tds-body-cell></tds-body-cell>
        <tds-body-cell></tds-body-cell>
      </tds-table-body-row>
    `;
    return;
  }

  dom.standingsTableBody.innerHTML = context.standings
    .map((entry) => {
      const weightText = entry.hasWeight ? formatWeight(entry.weightKg) : "Ingen vikt än";
      const rankText = entry.rank ? String(entry.rank) : "-";
      const imagesMarkup = renderStandingsExpandedImages(entry);
      return `
        <tds-table-body-row-expandable
          class="${entry.isSelf ? "is-self" : ""}"
          col-span="5"
          overflow="visible"
          tds-aria-label-expand-button="Visa bilder fÃ¶r ${escapeHtml(entry.name)}"
        >
          <tds-body-cell>
            <button
              type="button"
              class="participant-standings-toggle"
              data-standings-toggle="${escapeHtml(entry.id || entry.name)}"
              data-standings-detail-id="${detailId}"
              aria-expanded="false"
              aria-controls="${detailId}"
              aria-label="Visa bilder för ${escapeHtml(entry.name)}"
            >⌄</button>
          </tds-body-cell>
          <tds-body-cell>${escapeHtml(rankText)}</tds-body-cell>
          <tds-body-cell>${escapeHtml(entry.name)}</tds-body-cell>
          <tds-body-cell>${escapeHtml(entry.team || "Ingen avdelning")}</tds-body-cell>
          <tds-body-cell>${escapeHtml(weightText)}</tds-body-cell>
        </tds-table-body-row>
        <tds-table-body-row id="${detailId}" class="participant-standings-detail-row" hidden>
          <tds-body-cell></tds-body-cell>
          <tds-body-cell colspan="4">
            <div class="participant-standings-expand">
              ${imagesMarkup}
            </div>
          </tds-body-cell>
        </tds-table-body-row>
      `;
    })
    .join("");

  bindStandingsExpandableRows();
}

function renderStandingsExpandedImages(entry) {
  const fallbackImages =
    context &&
    context.participantImagesById &&
    entry &&
    entry.id &&
    context.participantImagesById[entry.id]
      ? normalizeParticipantImages(context.participantImagesById[entry.id])
      : createEmptyParticipantImages();
  const directImages =
    entry && entry.images ? normalizeParticipantImages(entry.images) : createEmptyParticipantImages();
  const hasDirectImage = Object.values(directImages).some((image) => Boolean(normalizeParticipantImage(image).path));
  const images = hasDirectImage ? directImages : fallbackImages;

  return PARTICIPANT_IMAGE_STAGES.map((stage) => {
    const image = normalizeParticipantImage(images[stage.key]);
    const hasImage = Boolean(image.path);
    const imageMarkup = hasImage
      ? `<button
          type="button"
          class="participant-standings-image-button"
          data-image-path="${escapeHtml(image.path)}"
          data-image-participant="${escapeHtml(entry.name)}"
          data-image-stage="${escapeHtml(stage.label)}"
          data-image-position-x="${escapeHtml(String(image.positionX))}"
          data-image-position-y="${escapeHtml(String(image.positionY))}"
          data-image-scale="${escapeHtml(String(image.scale))}"
          aria-label="Visa större bild för ${escapeHtml(`${entry.name} - ${stage.label}`)}"
        >
          <img
            src="${escapeHtml(image.path)}"
            alt="${escapeHtml(`${entry.name} - ${stage.label}`)}"
            class="participant-standings-expand-image"
            style="--image-offset-x:${image.positionX}%; --image-offset-y:${image.positionY}%; --image-scale:${image.scale};"
          />
        </button>`
      : `<div class="empty-state">Ingen bild</div>`;

    return `
      <div class="participant-standings-image-thumb" aria-label="${escapeHtml(stage.label)}">
        <div class="tegel-stage-preview participant-standings-image-shell participant-standings-image-shell--thumb">
          ${imageMarkup}
        </div>
      </div>
    `;
  }).join("");
}

function bindStandingsExpandableRows() {
  if (!dom.standingsTableBody) {
    return;
  }

  const toggles = Array.from(dom.standingsTableBody.querySelectorAll("[data-standings-toggle]"));
  toggles.forEach((toggle) => {
    if (toggle.dataset.expandBound === "true") {
      return;
    }

    toggle.dataset.expandBound = "true";
    toggle.addEventListener("click", () => {
      const detailId = toggle.getAttribute("data-standings-detail-id");
      const detailRow = detailId ? document.getElementById(detailId) : null;
      const isExpanded = toggle.getAttribute("aria-expanded") === "true";

      toggles.forEach((candidate) => {
        const candidateDetailId = candidate.getAttribute("data-standings-detail-id");
        const candidateDetailRow = candidateDetailId ? document.getElementById(candidateDetailId) : null;
        candidate.setAttribute("aria-expanded", "false");
        candidate.textContent = "⌄";
        if (candidateDetailRow) {
          candidateDetailRow.hidden = true;
        }
      });

      if (!isExpanded && detailRow) {
        toggle.setAttribute("aria-expanded", "true");
        toggle.textContent = "⌃";
        detailRow.hidden = false;
      }
    });
  });
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
  if (!dom.syncStatus) {
    return;
  }

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
  if (!dom.notice) {
    return;
  }

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
  const participantImagesByIdInput =
    input.participantImagesById && typeof input.participantImagesById === "object"
      ? input.participantImagesById
      : {};
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
    participantImagesById: Object.fromEntries(
      Object.entries(participantImagesByIdInput)
        .map(([participantId, images]) => [sanitizeId(participantId), normalizeParticipantImages(images)])
        .filter(([participantId]) => participantId),
    ),
    standings: standings.map((entry) => ({
        id: sanitizeId(entry.id),
        rank: sanitizeRank(entry.rank),
        name: sanitizeText(entry.name, 80),
        team: sanitizeText(entry.team, 80),
        images: normalizeParticipantImages(entry.images),
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
  if (!select) {
    return;
  }

  if (select.tagName === "TDS-DROPDOWN") {
    runtime.isUpdatingCompetitionSelect = true;
    select.innerHTML = options.length
      ? options
          .map(
            (option) =>
              `<tds-dropdown-option value="${escapeHtml(option.value)}"${
                option.value === selectedValue ? " selected" : ""
              }>${escapeHtml(option.label)}</tds-dropdown-option>`,
          )
          .join("")
      : '<tds-dropdown-option value="">Inga val tillgangliga</tds-dropdown-option>';

    const selectedOption = options.find((option) => option.value === selectedValue) || null;
    if (selectedOption) {
      if (typeof select.setValue === "function") {
        select.setValue(selectedOption.value, selectedOption.label).catch(() => {
          setControlValue(select, selectedValue || "");
        });
      } else {
        setControlValue(select, selectedValue || "");
      }
    } else if (typeof select.reset === "function") {
      select.reset().catch(() => {
        setControlValue(select, "");
      });
    } else {
      setControlValue(select, "");
    }

    if (selectedValue) {
      window.setTimeout(() => closeDropdownElement(select), 0);
    }
    window.setTimeout(() => {
      runtime.isUpdatingCompetitionSelect = false;
    }, 0);
    return;
  }

  select.innerHTML = options.length
    ? options
        .map(
          (option) =>
            `<option value="${escapeHtml(option.value)}"${option.value === selectedValue ? " selected" : ""}>${escapeHtml(option.label)}</option>`,
        )
        .join("")
    : '<option value="">Inga val tillgangliga</option>';
}

function bindControlEvents(element, handler) {
  if (!element || typeof handler !== "function") {
    return;
  }

  CONTROL_EVENTS.forEach((eventName) => {
    element.addEventListener(eventName, handler);
  });
}

function getControlValue(element) {
  if (!element || !("value" in element)) {
    return "";
  }

  return typeof element.value === "string" || typeof element.value === "number" ? String(element.value) : "";
}

function setControlValue(element, value) {
  if (!element || !("value" in element) || document.activeElement === element) {
    return;
  }

  element.value = value;
}

function setControlDisabled(element, disabled) {
  if (!element) {
    return;
  }

  if ("disabled" in element) {
    element.disabled = Boolean(disabled);
  }

  if (disabled) {
    element.setAttribute("disabled", "");
  } else {
    element.removeAttribute("disabled");
  }
}

function closeDropdownElement(element) {
  if (!element) {
    return;
  }

  if (typeof element.close === "function") {
    element.close().catch(() => {});
  }

  if ("open" in element) {
    element.open = false;
  }

  element.removeAttribute("open");

  if (typeof element.blur === "function") {
    element.blur();
  }

  const list = getDropdownListElement(element);
  if (list) {
    list.classList.remove("open", "animation-enter-slide", "animation-enter-fade");
    if (!list.classList.contains("closed")) {
      list.classList.add("closed");
    }
    list.removeAttribute("style");
  }
}

function getDropdownListElement(dropdown) {
  if (!dropdown || !dropdown.shadowRoot) {
    return null;
  }

  return dropdown.shadowRoot.querySelector(".dropdown-list");
}

function positionDropdownList(dropdown) {
  const list = getDropdownListElement(dropdown);
  if (!list) {
    return;
  }

  const isOpen =
    list.classList.contains("open") ||
    dropdown.hasAttribute("open") ||
    (typeof dropdown.open === "boolean" && dropdown.open);
  if (!isOpen) {
    return;
  }

  const rect = dropdown.getBoundingClientRect();
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
  const gap = 6;
  const spaceBelow = viewportHeight - rect.bottom - gap;
  const spaceAbove = rect.top - gap;
  const openUp = spaceBelow < 160 && spaceAbove > spaceBelow;
  const maxHeight = Math.max(140, Math.min(320, openUp ? spaceAbove : spaceBelow));

  list.style.position = "fixed";
  list.style.left = `${Math.round(rect.left)}px`;
  list.style.width = `${Math.round(rect.width)}px`;
  list.style.zIndex = "9999";
  list.style.maxHeight = `${Math.round(maxHeight)}px`;
  list.style.overflow = "auto";
  list.style.transform = "none";

  if (openUp) {
    list.style.top = "";
    list.style.bottom = `${Math.round(viewportHeight - rect.top + gap)}px`;
  } else {
    list.style.bottom = "";
    list.style.top = `${Math.round(rect.bottom + gap)}px`;
  }
}

function bindDropdownPositioning(dropdown) {
  if (!dropdown) {
    return;
  }

  const handler = () => window.setTimeout(() => positionDropdownList(dropdown), 0);
  dropdown.addEventListener("click", () => {
    const list = getDropdownListElement(dropdown);
    if (list && list.classList.contains("open")) {
      closeDropdownElement(dropdown);
      return;
    }
    handler();
  });
  dropdown.addEventListener("keydown", handler);
  dropdown.addEventListener("tdsChange", handler);
  dropdown.addEventListener("focus", handler);
}

function setTagText(element, text) {
  if (!element) {
    return;
  }

  element.textContent = text;
  if ("text" in element) {
    element.text = text;
  }
  element.setAttribute("text", text);
}

function bindModalCloseEvents(modal, onClose) {
  if (!modal) {
    return;
  }

  ["close", "tdsClose", "tds-close"].forEach((eventName) => {
    modal.addEventListener(eventName, () => {
      if (typeof onClose === "function") {
        onClose();
      }
    });
  });
}

function openModalElement(modal) {
  if (!modal) {
    return;
  }

  if (typeof modal.show === "function") {
    modal.show();
    return;
  }

  if (typeof modal.openModal === "function") {
    modal.openModal();
    return;
  }

  if (typeof modal.showModal === "function") {
    modal.showModal();
    return;
  }

  modal.classList.remove("hide");
  modal.classList.add("show");
  modal.hidden = false;
  modal.removeAttribute("hide");
  modal.setAttribute("show", "");
  modal.setAttribute("open", "");

  if ("open" in modal) {
    try {
      modal.open = true;
    } catch {}
  }

  if ("show" in modal) {
    try {
      modal.show = true;
    } catch {}
  }

  const backdrop = modal.shadowRoot?.querySelector(".tds-modal-backdrop");
  if (backdrop instanceof HTMLElement) {
    backdrop.style.display = "block";
  }
}

function closeModalElement(modal) {
  if (!modal) {
    return;
  }

  if (typeof modal.hide === "function") {
    modal.hide();
    return;
  }

  if (typeof modal.dismiss === "function") {
    modal.dismiss();
    return;
  }

  if (typeof modal.close === "function") {
    modal.close();
    return;
  }

  modal.classList.remove("show");
  modal.classList.add("hide");
  modal.setAttribute("hide", "");
  modal.removeAttribute("open");
  modal.removeAttribute("show");

  if ("open" in modal) {
    try {
      modal.open = false;
    } catch {}
  }

  if ("show" in modal) {
    try {
      modal.show = false;
    } catch {}
  }

  const backdrop = modal.shadowRoot?.querySelector(".tds-modal-backdrop");
  if (backdrop instanceof HTMLElement) {
    backdrop.style.display = "none";
  }

  modal.dispatchEvent(new Event("close"));
}

function renderSelectOptions(select, options, selectedValue) {
  const isTdsDropdown = select?.tagName === "TDS-DROPDOWN";

  if (isTdsDropdown) {
    select.innerHTML = options.length
      ? options
          .map(
            (option) =>
              `<tds-dropdown-option value="${escapeHtml(option.value)}"${option.value === selectedValue ? " selected" : ""}>${escapeHtml(option.label)}</tds-dropdown-option>`,
          )
          .join("")
      : '<tds-dropdown-option value="">Inga val tillgängliga</tds-dropdown-option>';
    if (typeof selectedValue === "string") {
      select.value = selectedValue;
    }
    return;
  }

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
