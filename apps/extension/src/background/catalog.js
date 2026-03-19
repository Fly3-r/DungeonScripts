const assertPackageList = (payload) => {
  if (!payload?.ok || !Array.isArray(payload.packages)) {
    throw new Error("Catalog package list response was invalid.");
  }

  return payload.packages;
};

const assertPackageManifest = (payload) => {
  const pkg = payload?.package;
  const requiredFields = [
    "id",
    "name",
    "version",
    "author",
    "sharedLibrary",
    "onInput",
    "onModelContext",
    "onOutput",
    "minInstallerVersion",
    "hash"
  ];

  if (!payload?.ok || !pkg) {
    throw new Error("Catalog package response was invalid.");
  }

  for (const field of requiredFields) {
    if (typeof pkg[field] !== "string") {
      throw new Error(`Package field \"${field}\" is missing or invalid.`);
    }
  }

  return pkg;
};

export const fetchCatalogPackages = async (catalogOrigin) => {
  const response = await fetch(`${catalogOrigin}/api/packages`);
  if (!response.ok) {
    throw new Error(`Catalog HTTP ${response.status}: ${response.statusText}`);
  }

  const payload = await response.json();
  return assertPackageList(payload);
};

export const fetchCatalogPackage = async (catalogOrigin, packageId) => {
  const response = await fetch(
    `${catalogOrigin}/api/packages/${encodeURIComponent(packageId)}`
  );
  if (!response.ok) {
    throw new Error(`Catalog HTTP ${response.status}: ${response.statusText}`);
  }

  const payload = await response.json();
  return assertPackageManifest(payload);
};