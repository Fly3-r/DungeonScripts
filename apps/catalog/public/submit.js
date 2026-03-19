const form = document.getElementById("submission-form");
const submitButton = document.getElementById("submit-button");
const statusBanner = document.getElementById("submission-status");
const packageIdInput = form.elements.packageId;
const nameInput = form.elements.name;
let packageIdTouched = false;

const slugify = (value) =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

const setStatus = (message, state) => {
  statusBanner.hidden = false;
  statusBanner.dataset.state = state;
  statusBanner.textContent = message;
};

nameInput.addEventListener("input", () => {
  if (!packageIdTouched) {
    packageIdInput.value = slugify(nameInput.value);
  }
});

packageIdInput.addEventListener("input", () => {
  packageIdTouched = packageIdInput.value.trim().length > 0;
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  submitButton.disabled = true;
  setStatus("Submitting package for manual review...", "working");

  const payload = {
    packageId: form.elements.packageId.value,
    name: form.elements.name.value,
    version: form.elements.version.value,
    authorProfileUrl: form.elements.authorProfileUrl.value,
    thumbnailUrl: form.elements.thumbnailUrl.value,
    description: form.elements.description.value,
    discordUsername: form.elements.discordUsername.value,
    sharedLibrary: form.elements.sharedLibrary.value,
    onInput: form.elements.onInput.value,
    onModelContext: form.elements.onModelContext.value,
    onOutput: form.elements.onOutput.value
  };

  try {
    const response = await fetch("/api/v1/submissions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    const data = await response.json();

    if (!response.ok || !data?.ok) {
      throw new Error(data?.error || "Submission failed.");
    }

    form.reset();
    packageIdTouched = false;
    setStatus(`Submission queued for review. Submission ID: ${data.submissionId}`, "success");
  } catch (error) {
    setStatus(`Submission failed: ${error.message}`, "error");
  } finally {
    submitButton.disabled = false;
  }
});
