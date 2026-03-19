export const gql = async (url, token, query, variables = {}) => {
  const operationMatch = query.match(/(?:query|mutation)\s+(\w+)/);
  const operationName = operationMatch?.[1] ?? undefined;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `firebase ${token}`
    },
    body: JSON.stringify({
      operationName,
      query,
      variables
    })
  });

  if (!response.ok) {
    throw new Error(`GraphQL HTTP ${response.status}: ${response.statusText}`);
  }

  const json = await response.json();
  if (json.errors?.length) {
    throw new Error(`GraphQL error: ${json.errors[0].message}`);
  }

  return json.data;
};