const FALLBACK_THUMBNAIL_URL = "/assets/thumbnail-placeholder.svg";
const packageList = document.getElementById("package-list");
const packageSearch = document.getElementById("package-search");
const packageSearchSummary = document.getElementById("package-search-summary");

let allPackages = [];

const normalizeSearchText = (value) => String(value || "").trim().toLowerCase();

const setSearchSummary = (message) => {
  if (packageSearchSummary) {
    packageSearchSummary.textContent = message;
  }
};

const createStat = (label, value) => {
  const wrapper = document.createElement("div");
  const dt = document.createElement("dt");
  const dd = document.createElement("dd");

  dt.textContent = label;

  if (value instanceof Node) {
    dd.append(value);
  } else {
    dd.textContent = value;
  }

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

const createAuthorValue = (pkg) => {
  if (!pkg.authorProfileUrl) {
    return pkg.author || "Unknown";
  }

  const link = document.createElement("a");
  link.className = "package-author";
  link.href = pkg.authorProfileUrl;
  link.target = "_blank";
  link.rel = "noreferrer noopener";
  link.textContent = pkg.author || pkg.authorProfileUrl;
  return link;
};

const getPackageSearchScore = (pkg, query) => {
  if (!query) {
    return 0;
  }

  const normalizedName = normalizeSearchText(pkg.name);
  const normalizedDescription = normalizeSearchText(pkg.description);
  const terms = query.split(/\s+/).filter(Boolean);
  let score = 0;

  if (normalizedName === query) {
    score += 500;
  } else if (normalizedName.startsWith(query)) {
    score += 320;
  } else if (normalizedName.includes(query)) {
    score += 220;
  }

  if (normalizedDescription.includes(query)) {
    score += 90;
  }

  for (const term of terms) {
    if (normalizedName.includes(term)) {
      score += 45;
    }

    if (normalizedDescription.includes(term)) {
      score += 15;
    }
  }

  return score;
};

const filterPackages = (packages, rawQuery) => {
  const query = normalizeSearchText(rawQuery);
  if (!query) {
    return packages;
  }

  return packages
    .map((pkg, index) => ({
      pkg,
      index,
      score: getPackageSearchScore(pkg, query)
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return left.index - right.index;
    })
    .map((entry) => entry.pkg);
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
    description.className = "muted package-description";
    description.textContent = pkg.description || "No description provided.";

    const meta = document.createElement("dl");
    meta.className = "package-meta";
    meta.append(
      createStat("Version", pkg.version),
      createStat("Author", createAuthorValue(pkg)),
      createStat("Installs", String(pkg.installCount || 0))
    );

    const actions = document.createElement("div");
    actions.className = "package-actions";

    const previewButton = document.createElement("button");
    previewButton.type = "button";
    previewButton.className = "action-button secondary";
    previewButton.dataset.oneclickPreview = "true";
    previewButton.dataset.packageId = pkg.id;
    previewButton.dataset.packageName = pkg.name;
    previewButton.textContent = "Preview";
    previewButton.disabled = true;

    const installButton = document.createElement("button");
    installButton.type = "button";
    installButton.className = "action-button";
    installButton.dataset.oneclickInstall = "true";
    installButton.dataset.packageId = pkg.id;
    installButton.dataset.packageName = pkg.name;
    installButton.textContent = "Install";
    installButton.disabled = true;

    const rollbackButton = document.createElement("button");
    rollbackButton.type = "button";
    rollbackButton.className = "action-button danger";
    rollbackButton.dataset.oneclickRollback = "true";
    rollbackButton.dataset.packageId = pkg.id;
    rollbackButton.dataset.packageName = pkg.name;
    rollbackButton.textContent = "Rollback";
    rollbackButton.disabled = true;
    rollbackButton.hidden = true;

    const packageId = document.createElement("code");
    packageId.textContent = pkg.id;

    actions.append(previewButton, installButton, rollbackButton, packageId);
    header.append(title);
    body.append(header, description, meta, actions);
    media.append(thumbnail);
    article.append(media, body);
    packageList.append(article);
  }
};

const renderFilteredPackages = () => {
  const rawQuery = packageSearch?.value || "";
  const filteredPackages = filterPackages(allPackages, rawQuery);

  if (!normalizeSearchText(rawQuery)) {
    setSearchSummary("Search by package name or description.");
    renderPackages(allPackages);
    return;
  }

  setSearchSummary(
    `Showing ${filteredPackages.length} of ${allPackages.length} package(s) for "${rawQuery.trim()}".`
  );

  if (filteredPackages.length === 0) {
    renderEmpty(`No packages match "${rawQuery.trim()}".`);
    return;
  }

  renderPackages(filteredPackages);
};

const render = async () => {
  try {
    const response = await fetch("/api/v1/packages");
    const data = await response.json();

    if (!data?.ok) {
      throw new Error(data?.error || "Catalog response was invalid.");
    }

    allPackages = Array.isArray(data.packages) ? data.packages : [];
    renderFilteredPackages();
  } catch (error) {
    renderEmpty(`Failed to load packages: ${error.message}`);
    setSearchSummary("Search is unavailable until the catalog packages finish loading.");
  }
};

packageSearch?.addEventListener("input", () => {
  renderFilteredPackages();
});

render();
