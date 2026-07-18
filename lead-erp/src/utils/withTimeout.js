/**
 * Wrap a promise so it rejects if it doesn't settle within `ms`.
 * Prevents Firestore calls from hanging the UI forever (infinite spinners)
 * when the DB is unreachable or a request stalls.
 *
 * @param {Promise} promise - the promise to guard
 * @param {number} ms - timeout in milliseconds
 * @param {string} label - used in the timeout error message
 */
export function withTimeout(promise, ms = 15000, label = "operation") {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(`Timed out: ${label}`);
      err.code = "deadline-exceeded";
      reject(err);
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
