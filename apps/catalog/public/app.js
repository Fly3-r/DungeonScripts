const FALLBACK_THUMBNAIL_URL = "/assets/thumbnail-placeholder.svg";
const packageList = document.getElementById("package-list");

const createStat = (label, value) => {
  const wrapper = document.createElement("div");
  const dt = document.createElement("dt");
  const dd = document.createElement("dd");

  dt.textContent = label;
  dd.textContent = value;
  wrapper.append(dt, dd);
  return wrapper;
};

const renderEmpty = (message) => {
  packageList.innerHTML = "";
  const paragraph = document.createElement("p");
  paragraph.className = "muted";
  paragraph.textContent = message;
  packageList.append(paragraph);
};

const applyFallbackThumbnail = (image) => {
  if (image.dataset.fallbackApplied === "true") {
    return;
  }

  image.dataset.fallbackApplied = "true";
  image.src = FALLBACK_THUMBNAIL_URL;
};

const renderPackages = (packages) => {
  if (!Array.isArray(packages) || packages.length === 0) {
    renderEmpty("No packages found.");
    return;
  }

  packageList.innerHTML = "";

  for (const pkg of packages) {
    const article = document.createElement("article");
    article.className = "package-card";

    const media = document.createElement("div");
    media.className = "package-media";

    const thumbnail = document.createElement("img");
    thumbnail.className = "package-thumb";
    thumbnail.alt = `${pkg.name} thumbnail`;
    thumbnail.loading = "lazy";
    thumbnail.src = pkg.thumbnailUrl || FALLBACK_THUMBNAIL_URL;
    thumbnail.addEventListener("error", () => applyFallbackThumbnail(thumbnail), {
      once: false
    });

    const body = document.createElement("div");
    body.className = "package-body";

    const header = document.createElement("div");
    header.className = "package-header";

    const title = document.createElement("h3");
    title.textContent = pkg.name;

    const description = document.createElement("p");
    description.className = "muted";
    description.textContent = pkg.description || "No description provided.";

    const meta = document.createElement("dl");
    meta.className = "package-meta";
    meta.append(
      createStat("Version", pkg.version),
      createStat("Author", pkg.author),
      createStat("Installs", String(pkg.installCount || 0))
    );

    const actions = document.createElement("div");
    actions.className = "package-actions";

    const installButton = document.createElement("button");
    installButton.type = "button";
    installButton.className = "action-button";
    installButton.dataset.oneclickInstall = "true";
    installButton.dataset.packageId = pkg.id;
    installButton.dataset.packageName = pkg.name;
    installButton.textContent = "Use Extension To Install";
    installButton.disabled = true;

    const rollbackButton = document.createElement("button");
    rollbackButton.type = "button";
    rollbackButton.className = "action-button danger";
    rollbackButton.dataset.oneclickRollback = "true";
    rollbackButton.dataset.packageId = pkg.id;
    rollbackButton.dataset.packageName = pkg.name;
    rollbackButton.textContent = "Rollback Latest";
    rollbackButton.disabled = true;
    rollbackButton.hidden = true;

    const packageId = document.createElement("code");
    packageId.textContent = pkg.id;

    actions.append(installButton, rollbackButton, packageId);
    header.append(title);
    body.append(header, description, meta, actions);
    media.append(thumbnail);
    article.append(media, body);
    packageList.append(article);
  }
};

const render = async () => {
  try {
    const response = await fetch("/api/v1/packages");
    const data = await response.json();

    if (!data?.ok) {
      throw new Error(data?.error || "Catalog response was invalid.");
    }

    renderPackages(data.packages);
  } catch (error) {
    renderEmpty(`Failed to load packages: ${error.message}`);
  }
};

render();
