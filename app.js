const CONFIG = {
  appsScriptUrl: "https://script.google.com/macros/s/AKfycby34tfOsu_gK70hRTxYrKBW_B_aD3uxnPsYg91sd7qt3tJQn5aPvm7U3G2WmY2fb7Twuw/exec",
};

async function callApi(action, params = {}) {
  const url = new URL(CONFIG.appsScriptUrl);
  url.searchParams.set("action", action);

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, value);
    }
  });

  const response = await fetch(url.toString());

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
  }

  return response.json();
}

function renderMatches(matches) {
  const list = document.querySelector("#matches-list");

  if (!list) {
    return;
  }

  list.innerHTML = matches
    .map((match) => {
      return `
        <article class="match-card">
          <div class="team">
            <span class="team-code">${match.teamA.teamSlug}</span>
            <strong>${match.teamA.team}</strong>
            <span>${match.teamADecimalOdds}x</span>
          </div>
          <div class="match-center">
            <strong>VS</strong>
            <span>${match.matchDateTime}</span>
          </div>
          <div class="team right">
            <span class="team-code">${match.teamB.teamSlug}</span>
            <strong>${match.teamB.team}</strong>
            <span>${match.teamBDecimalOdds}x</span>
          </div>
          <button type="button">Make Pick</button>
        </article>
      `;
    })
    .join("");
}

async function loadGameState() {
  const status = document.querySelector("#phase-status");
  const phaseName = document.querySelector("#phase-name");

  try {
    status.textContent = "Loading live game data...";

    const gameState = await callApi("getGameState");
    const matchesResult = await callApi("getMatches", {
      phase: gameState.activePhaseName,
    });

    phaseName.textContent = gameState.activePhaseName;
    status.textContent = `${gameState.gameStatus} · ${matchesResult.count} matches`;
    renderMatches(matchesResult.matches);
  } catch (error) {
    console.error(error);
    status.textContent = "Could not load live data. Check the Apps Script deployment.";
  }
}

document.querySelector("#refresh-button")?.addEventListener("click", loadGameState);

loadGameState();
