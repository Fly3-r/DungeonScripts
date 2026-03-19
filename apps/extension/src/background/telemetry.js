const INSTALL_SUCCESS_PATH = "/api/v1/telemetry/install-success";

export const postInstallSuccess = async (catalogOrigin, event) => {
  const response = await fetch(new URL(INSTALL_SUCCESS_PATH, catalogOrigin), {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(event)
  });

  if (!response.ok) {
    throw new Error(`Telemetry HTTP ${response.status}: ${response.statusText}`);
  }

  const payload = await response.json();
  if (!payload?.ok) {
    throw new Error(payload?.error || "Telemetry response was invalid.");
  }

  return payload;
};
