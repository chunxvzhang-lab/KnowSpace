/**
 * Reports how App.tsx uses the state that is moving into useUiStore.
 *
 * The migration replaces each `useState` pair with two store selectors, so the
 * identifier names stay identical and no other line has to change. What that
 * relies on is the store's setters accepting the same call shapes as
 * `useState`'s — which means the functional-update sites have to be found and
 * checked, not assumed.
 *
 * Usage: node scripts/audit-app-ui-state.cjs
 */

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const target = path.join(root, "src", "App.tsx");

/** state name -> store setter name (they differ only by the `Is` prefix here) */
const STATE_TO_SETTER = {
  sidebarOpen: "setSidebarOpen",
  directoryOpen: "setDirectoryOpen",
  sidebarTab: "setSidebarTab",
  isFullscreen: "setIsFullscreen",
  typewriterMode: "setTypewriterMode",
  lightboxMedia: "setLightboxMedia",
  notice: "setNotice",
  preferences: "setPreferences",
  unsavedDialogOpen: "setUnsavedDialogOpen",
  aboutOpen: "setAboutOpen",
  commandPaletteOpen: "setCommandPaletteOpen",
  versionHistoryOpen: "setVersionHistoryOpen",
  isGraphPaneOpen: "setIsGraphPaneOpen",
  directoryWidth: "setDirectoryWidth",
  sidebarWidth: "setSidebarWidth",
  resizingType: "setResizingType",
};

function main() {
  const lines = fs.readFileSync(target, "utf8").split(/\r?\n/);

  let totalFunctional = 0;
  const functionalSites = [];

  console.log("identifier            usages  functional-update sites");
  console.log("-".repeat(72));

  for (const [stateName, setterName] of Object.entries(STATE_TO_SETTER)) {
    let stateCount = 0;
    let setterCount = 0;

    lines.forEach((line) => {
      // Count reads of the state and calls of the setter separately.
      const stateMatches = line.match(new RegExp(`\\b${stateName}\\b`, "g"));
      if (stateMatches) stateCount += stateMatches.length;
      const setterMatches = line.match(new RegExp(`\\b${setterName}\\b`, "g"));
      if (setterMatches) setterCount += setterMatches.length;

      // Functional form: setter( (prev) => … or setter( prev => …
      if (new RegExp(`\\b${setterName}\\(\\s*\\(`).test(line)) {
        functionalSites.push(`  ${setterName}  line ${lines.indexOf(line) + 1}: ${line.trim().slice(0, 90)}`);
        totalFunctional += 1;
      }
    });

    console.log(
      `${stateName.padEnd(22)}${String(stateCount).padStart(4)}  ${String(setterCount).padStart(6)}`
    );
  }

  console.log(`\nFunctional-update call sites (${totalFunctional}):`);
  for (const site of functionalSites) console.log(site);
}

main();
