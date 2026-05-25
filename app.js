const CONFIG = {
  appsScriptUrl: "",
};

const mockMatches = [
  {
    matchId: "WC26-001",
    matchDateTime: "2026-06-11 12:00 PM PT",
    teamA: { team: "Mexico", teamSlug: "mexico" },
    teamB: { team: "South Africa", teamSlug: "south-africa" },
    teamADecimalOdds: 1.5,
    teamBDecimalOdds: 7.5,
  },
  {
    matchId: "WC26-002",
    matchDateTime: "2026-06-11 07:00 PM PT",
    teamA: { team: "South Korea", teamSlug: "south-korea" },
    teamB: { team: "Czechia", teamSlug: "czechia" },
    teamADecimalOdds: 2.75,
    teamBDecimalOdds: 2.75,
  },
];

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

  if (!CONFIG.appsScriptUrl) {
    status.textContent = "Using local mock data until Apps Script is deployed.";
    renderMatches(mockMatches);
    return;
  }

  status.textContent = "Connected backend loading will be added next.";
}

document.querySelector("#refresh-button")?.addEventListener("click", loadGameState);

loadGameState();
