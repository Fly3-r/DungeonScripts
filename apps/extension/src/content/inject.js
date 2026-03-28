(async () => {
  try {
    const FIREBASE_WAIT_MS = 15000;
    const FIREBASE_POLL_MS = 500;

    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    const waitForFreshFirebaseToken = async () => {
      const deadline = Date.now() + FIREBASE_WAIT_MS;

      while (Date.now() < deadline) {
        if (typeof firebase !== "undefined" && firebase.auth) {
          try {
            const user = firebase.auth().currentUser;
            if (user) {
              return await user.getIdToken(true);
            }
          } catch {
            // Keep polling until Firebase settles or the timeout expires.
          }
        }

        await delay(FIREBASE_POLL_MS);
      }

      return null;
    };

    let token = null;

    token = await waitForFreshFirebaseToken();

    if (!token) {
      try {
        const databases = await indexedDB.databases();
        for (const databaseInfo of databases) {
          if (!databaseInfo.name) {
            continue;
          }

          try {
            const db = await new Promise((resolve, reject) => {
              const request = indexedDB.open(databaseInfo.name);
              request.onsuccess = () => resolve(request.result);
              request.onerror = () => reject(request.error);
            });

            for (const storeName of Array.from(db.objectStoreNames)) {
              try {
                const transaction = db.transaction(storeName, "readonly");
                const store = transaction.objectStore(storeName);
                const items = await new Promise((resolve, reject) => {
                  const request = store.getAll();
                  request.onsuccess = () => resolve(request.result);
                  request.onerror = () => reject(request.error);
                });

                for (const item of items) {
                  const accessToken =
                    item?.stsTokenManager?.accessToken ||
                    item?.value?.stsTokenManager?.accessToken;

                  if (accessToken) {
                    token = accessToken;
                    break;
                  }
                }
              } catch {
                // Ignore unreadable stores.
              }

              if (token) {
                break;
              }
            }

            db.close();

            if (token) {
              break;
            }
          } catch {
            // Ignore inaccessible databases.
          }
        }
      } catch {
        // indexedDB.databases() may be unavailable.
      }
    }

    if (!token) {
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (!key) {
          continue;
        }

        try {
          const parsed = JSON.parse(localStorage.getItem(key));
          const accessToken = parsed?.stsTokenManager?.accessToken;
          if (accessToken) {
            token = accessToken;
            break;
          }
        } catch {
          // Ignore non-JSON values.
        }
      }
    }

    if (!token) {
      window.postMessage(
        {
          type: "AID_ONECLICK_TOKEN_ERROR",
          error: "Could not find Firebase token."
        },
        "*"
      );
      return;
    }

    window.postMessage(
      {
        type: "AID_ONECLICK_TOKEN",
        token
      },
      "*"
    );
  } catch (error) {
    window.postMessage(
      {
        type: "AID_ONECLICK_TOKEN_ERROR",
        error: error instanceof Error ? error.message : String(error)
      },
      "*"
    );
  }
})();
