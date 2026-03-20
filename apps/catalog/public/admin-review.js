const reviewerStorageKey = "aid-oneclick-reviewer-name";

const elements = {
  refreshButton: document.getElementById("review-refresh"),
  filterSelect: document.getElementById("review-status-filter"),
  reviewerInput: document.getElementById("reviewer-name"),
  counts: document.getElementById("admin-counts"),
  statusBanner: document.getElementById("admin-status"),
  submissionList: document.getElementById("admin-submission-list"),
  emptyState: document.getElementById("submission-empty-state"),
  detail: document.getElementById("submission-detail"),
  detailStatusChip: document.getElementById("detail-status-chip"),
  detailSubmissionId: document.getElementById("detail-submission-id"),
  detailPackageId: document.getElementById("detail-package-id"),
  detailPackageName: document.getElementById("detail-package-name"),
  detailVersion: document.getElementById("detail-version"),
  detailAuthorLink: document.getElementById("detail-author-link"),
  detailDiscord: document.getElementById("detail-discord"),
  detailCreatedAt: document.getElementById("detail-created-at"),
  detailUpdatedAt: document.getElementById("detail-updated-at"),
  detailPublishedManifest: document.getElementById("detail-published-manifest"),
  detailPublishedHash: document.getElementById("detail-published-hash"),
  detailDescription: document.getElementById("detail-description"),
  detailSharedLibrary: document.getElementById("detail-shared-library"),
  detailOnInput: document.getElementById("detail-on-input"),
  detailOnModelContext: document.getElementById("detail-on-model-context"),
  detailOnOutput: document.getElementById("detail-on-output"),
  reviewNotes: document.getElementById("review-notes"),
  actionButtons: Array.from(document.querySelectorAll("[data-review-action]"))
};

const state = {
  counts: {},
  submissions: [],
  selectedId: null,
  selectedSubmission: null
};

const setStatus = (message, status = "working") => {
  elements.statusBanner.hidden = false;
  elements.statusBanner.dataset.state = status;
  elements.statusBanner.textContent = message;
};

const clearStatus = () => {
  elements.statusBanner.hidden = true;
  elements.statusBanner.textContent = "";
  delete elements.statusBanner.dataset.state;
};

const formatDate = (value) => {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
};

const statusLabel = (value) =>
  value === "needs_changes"
    ? "Needs Changes"
    : value.charAt(0).toUpperCase() + value.slice(1);

const fetchJson = async (url, options) => {
  const response = await fetch(url, {
    cache: "no-store",
    ...options
  });

  if (response.status === 401) {
    throw new Error("Admin authentication required. Reload /admin and sign in again.");
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || `Request failed (${response.status}).`);
  }

  return payload;
};

const renderCounts = () => {
  const cards = [
    ["pending", "Pending"],
    ["approved", "Approved"],
    ["needs_changes", "Needs Changes"],
    ["rejected", "Rejected"]
  ];

  elements.counts.innerHTML = "";
  for (const [key, label] of cards) {
    const wrapper = document.createElement("div");
    const dt = document.createElement("dt");
    const dd = document.createElement("dd");
    dt.textContent = label;
    dd.textContent = String(state.counts[key] || 0);
    wrapper.append(dt, dd);
    elements.counts.append(wrapper);
  }
};

const appendMetaLine = (target, text) => {
  const paragraph = document.createElement("p");
  paragraph.className = "submission-item-meta";
  paragraph.textContent = text;
  target.append(paragraph);
};

const renderSubmissionList = () => {
  if (!state.submissions.length) {
    elements.submissionList.innerHTML = "<p class=\"muted\">No submissions found for this filter.</p>";
    return;
  }

  elements.submissionList.innerHTML = "";

  for (const submission of state.submissions) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "submission-item";
    if (submission.submissionId === state.selectedId) {
      button.classList.add("is-selected");
    }

    const header = document.createElement("div");
    header.className = "submission-item-header";

    const title = document.createElement("strong");
    title.textContent = submission.package.name;

    const chip = document.createElement("span");
    chip.className = `status-chip ${submission.status}`;
    chip.textContent = statusLabel(submission.status);

    header.append(title, chip);
    button.append(header);
    appendMetaLine(button, `${submission.package.id} · v${submission.package.version}`);
    appendMetaLine(button, `Discord: ${submission.contact.discordUsername}`);
    appendMetaLine(button, submission.package.descriptionPreview);
    appendMetaLine(button, formatDate(submission.createdAt));

    button.addEventListener("click", async () => {
      state.selectedId = submission.submissionId;
      renderSubmissionList();
      await loadSubmissionDetail(submission.submissionId);
    });

    elements.submissionList.append(button);
  }
};

const renderSubmissionDetail = () => {
  const submission = state.selectedSubmission;
  if (!submission) {
    elements.emptyState.hidden = false;
    elements.detail.hidden = true;
    return;
  }

  elements.emptyState.hidden = true;
  elements.detail.hidden = false;

  elements.detailStatusChip.textContent = statusLabel(submission.status);
  elements.detailStatusChip.className = `status-chip ${submission.status}`;
  elements.detailSubmissionId.textContent = submission.submissionId;
  elements.detailPackageId.textContent = submission.package.id;
  elements.detailPackageName.textContent = submission.package.name;
  elements.detailVersion.textContent = submission.package.version;
  elements.detailAuthorLink.textContent = submission.package.author;
  elements.detailAuthorLink.href = submission.package.authorProfileUrl || "#";
  elements.detailDiscord.textContent = submission.contact.discordUsername;
  elements.detailCreatedAt.textContent = formatDate(submission.createdAt);
  elements.detailUpdatedAt.textContent = formatDate(submission.updatedAt);
  elements.detailPublishedManifest.textContent = submission.publishedManifestFile || "Not published";
  elements.detailPublishedHash.textContent = submission.publishedHash || "-";
  elements.detailDescription.value = submission.package.description || "";
  elements.detailSharedLibrary.value = submission.package.sharedLibrary || "";
  elements.detailOnInput.value = submission.package.onInput || "";
  elements.detailOnModelContext.value = submission.package.onModelContext || "";
  elements.detailOnOutput.value = submission.package.onOutput || "";
  elements.reviewNotes.value = submission.review?.notes || "";

  const canReview = submission.status === "pending";
  elements.reviewNotes.disabled = !canReview;
  for (const button of elements.actionButtons) {
    button.hidden = !canReview;
    button.disabled = !canReview;
  }
};

const loadQueue = async () => {
  const data = await fetchJson(`/api/v1/admin/submissions?status=${encodeURIComponent(elements.filterSelect.value)}`);
  state.counts = data.counts;
  state.submissions = data.submissions;

  if (!state.submissions.some((item) => item.submissionId === state.selectedId)) {
    state.selectedId = state.submissions[0]?.submissionId || null;
  }

  renderCounts();
  renderSubmissionList();

  if (state.selectedId) {
    await loadSubmissionDetail(state.selectedId);
  } else {
    state.selectedSubmission = null;
    renderSubmissionDetail();
  }
};

const loadSubmissionDetail = async (submissionId) => {
  const data = await fetchJson(`/api/v1/admin/submissions/${encodeURIComponent(submissionId)}`);
  state.selectedSubmission = data.submission;
  renderSubmissionDetail();
};

const applyReviewAction = async (action) => {
  if (!state.selectedSubmission) {
    return;
  }

  const label = action === "needs_changes" ? "mark this as needing changes" : action;
  if (!window.confirm(`Do you want to ${label} for ${state.selectedSubmission.package.name}?`)) {
    return;
  }

  setStatus(`Submitting review decision for ${state.selectedSubmission.package.name}...`, "working");

  const data = await fetchJson(
    `/api/v1/admin/submissions/${encodeURIComponent(state.selectedSubmission.submissionId)}/review`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        action,
        reviewer: elements.reviewerInput.value,
        notes: elements.reviewNotes.value
      })
    }
  );

  setStatus(`Submission ${data.submission.submissionId} updated to ${statusLabel(data.submission.status)}.`, "success");
  await loadQueue();
};

const init = async () => {
  elements.reviewerInput.value = localStorage.getItem(reviewerStorageKey) || "";
  elements.reviewerInput.addEventListener("input", () => {
    localStorage.setItem(reviewerStorageKey, elements.reviewerInput.value);
  });

  elements.refreshButton.addEventListener("click", async () => {
    clearStatus();
    await loadQueue();
  });

  elements.filterSelect.addEventListener("change", async () => {
    clearStatus();
    await loadQueue();
  });

  for (const button of elements.actionButtons) {
    button.addEventListener("click", async () => {
      try {
        await applyReviewAction(button.dataset.reviewAction);
      } catch (error) {
        setStatus(error.message, "error");
      }
    });
  }

  const adminStatus = await fetchJson("/api/v1/admin/status");
  if (!adminStatus.configured) {
    setStatus("Admin review is not configured. Set CATALOG_ADMIN_PASSWORD in the catalog environment.", "error");
    elements.refreshButton.disabled = true;
    elements.filterSelect.disabled = true;
    return;
  }

  await loadQueue();
};

init().catch((error) => {
  setStatus(error.message, "error");
});
