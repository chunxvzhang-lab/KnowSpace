/**
 * Comparing two paths, which six places in the app have to do.
 *
 * Six, because "is this the same file" is asked wherever a document can arrive from
 * more than one direction: a tab against a chapter, a session against a file that
 * was just written, a listing against a file that was just refreshed. It was spelled
 * out inline each time, and the spellings differed — most remembered to check that
 * both sides had a path, two did not, and those two would throw rather than answer
 * if a path were ever missing. One function, one rule, written down once.
 */

/**
 * Whether two paths name the same file.
 *
 * Case-insensitively: this runs on Windows as often as anywhere, and the OS does not
 * distinguish `C:\Notes\a.md` from `c:\notes\A.MD`. Compared as strings rather than
 * resolved through the filesystem — no `realpath`, no normalisation — because this is
 * asked constantly while the app is being used, and neither side ever produces a
 * path that needs it: they come from the same bridge, which hands back what the
 * platform gave it.
 *
 * A missing path matches nothing, **including another missing path**. Two documents
 * that have no file are not the same document, they are two documents that each have
 * no file — and treating them as one is how a new document opens into a tab that
 * belongs to something else.
 */
export function samePath(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  return a.toLowerCase() === b.toLowerCase();
}
