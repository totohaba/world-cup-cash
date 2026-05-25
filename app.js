const CONFIG = {
  appsScriptUrl: "https://script.google.com/macros/s/AKfycby34tfOsu_gK70hRTxYrKBW_B_aD3uxnPsYg91sd7qt3tJQn5aPvm7U3G2WmY2fb7Twuw/exec",
};

const STORAGE_KEYS = {
  deviceId: "worldCupCashDeviceId",
  player: "worldCupCashPlayer",
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

function getOrCreateDeviceId() {
  const existingId = localStorage.getItem(STORAGE_KEYS.deviceId);

  if (existingId) {
    return existingId;
  }

  const newId = `device_${crypto.randomUUID()}`;
  localStorage.setItem(STORAGE_KEYS.deviceId, newId);
  return newId;
}

function getSavedPlayer() {
  const saved = localStorage.getItem(STORAGE_KEYS.player);
  return saved ? JSON.parse(saved) : null;
}

function savePlayer(player) {
  localStorage.setItem(STORAGE_KEYS.player, JSON.stringify(player));
}

function renderPlayer(player) {
  const joinPanel = document.querySelector("#join-panel");
  const playerPanel = document.querySelector("#player-panel");
  const playerName = document.querySelector("#player-name");
  const balance = document.querySelector("#current-balance");

  if (!player) {
    joinPanel.hidden = false;
    playerPanel.hidden = true;
    return;
  }

  joinPanel.hidden = true;
  playerPanel.hidden = false;
  playerName.textContent = player.display_name;
  balance.textContent = `$${Number(player.current_balance).toFixed(0)}`;
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

async function handleJoinSubmit(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const input = form.querySelector("#display-name");
  const submitButton = form.querySelector("button");
  const displayName = input.value.trim();

  if (!displayName) {
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = "Joining...";

  try {
    const result = await callApi("joinGame", {
      deviceId: getOrCreateDeviceId(),
      displayName,
    });

    savePlayer(result.player);
    renderPlayer(result.player);
  } catch (error) {
    console.error(error);
    alert("Could not join the game. Please try again.");
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Join Game";
  }
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
document.querySelector("#join-form")?.addEventListener("submit", handleJoinSubmit);

renderPlayer(getSavedPlayer());
loadGameState();
