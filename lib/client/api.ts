export async function readResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(
      response.status === 413
        ? "The upload is too large."
        : "The server returned an empty or invalid response. Retry after checking your connection.",
    );
  }
  if (!response.ok) throw new Error(body.error || "Request failed.");
  return body;
}
export async function post<T>(url: string, body: unknown): Promise<T> {
  return readResponse<T>(
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}
