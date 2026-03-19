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
    thumbnail.src = pkg.thumbnailUrl;

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

    const packageId = document.createElement("code");
    packageId.textContent = pkg.id;

    actions.append(installButton, packageId);
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
