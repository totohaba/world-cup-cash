# World Cup Cash — Technical Specification v1

## 1. Technical Direction

World Cup Cash will start as a mobile-first web app designed primarily for iPhone Safari.

The first prototype should prove the full game loop for Group Matchday 1 before expanding to the full tournament.

The app will use Google Sheets as the live backend database. Players will not directly open or edit the Google Sheet. The app will read and write game data through a small backend/API layer.

The backend/API for v1 will be Google Apps Script.

The mobile web app will be hosted on GitHub Pages.

The first prototype should prioritize a functional UI over final visual polish.

## 2. Prototype Goal

The first working prototype should support one complete phase: Group Matchday 1.

The prototype should prove this flow:

1. Admin sets up the game data.
2. Player joins from an invite link.
3. Player enters a display name.
4. App creates and stores a browser-based player/device ID.
5. Player views Group Matchday 1 matches.
6. Player makes or edits picks before the phase locks.
7. Player chooses a total bet amount.
8. Picks are saved to Google Sheets.
9. Leaderboard updates while betting is active.
10. Admin enters or uploads match results.
11. App settles bets.
12. Leaderboard updates with final balances and records.

## 3. Architecture

The app should use this structure:

```text
iPhone Safari
  -> Mobile-first web app
  -> Google Apps Script backend/API
  -> Google Sheets
```

The browser app should not contain Google credentials.

Google Apps Script is responsible for:

- Reading from Google Sheets
- Writing to Google Sheets
- Validating player actions
- Enforcing phase lock rules
- Calculating balances, pending bets, records, and leaderboard data
- Returning only the data needed by the app

Google Sheets stores data. Google Apps Script calculates game logic.

## 4. Target Platform

Primary target:

- iPhone Safari

Secondary support can be considered later.

The prototype should be tested on iPhone-sized Safari layouts first. Desktop polish is not a priority for the first prototype.

## 5. Player Access

Players join through an invite link.

No PIN or password is required for v1.

It is acceptable if the invite link is forwarded.

When a player opens the invite link for the first time:

1. The app asks for a display name.
2. The app generates a random player/device ID.
3. The app stores that ID in the browser.
4. The app creates a player row in Google Sheets.

When the same browser opens the app again:

1. The app reads the stored player/device ID.
2. The app loads the existing player profile.
3. The app should not create a duplicate player.

The app does not need to know the real iPhone device ID. The player/device ID is an app-generated ID stored in the browser.

Admin access should use a separate admin URL. Regular players should use the normal player invite/app URL.

## 6. Pick Privacy

Picks are not private during the betting phase.

Players should be able to see live leaderboard activity while a phase is open, including:

- Who has placed picks
- Current Balance
- Pending Bets
- Potential Payout
- Win / Loss / Draw record

The app does not need to hide picks until the phase locks.

## 7. Google Sheets Backend

Google Sheets is the live data store for v1.

Only the admin should directly access the Google Sheet.

Players interact with the app only. The app interacts with Google Sheets through Google Apps Script.

Sheets should not contain complex gameplay formulas for v1. The backend should calculate game logic and write the resulting values to Sheets.

Recommended tabs:

- `Settings`
- `Phases`
- `Teams`
- `Matches`
- `Players`
- `Picks`
- `SettlementLog`

## 8. Sheet: Settings

Purpose: store simple game-level settings.

Recommended columns:

- `key`
- `value`

Example rows:

- `game_name` = `World Cup Cash`
- `active_phase` = `Group Matchday 1`
- `game_status` = `setup`, `open`, `locked`, `settling`, or `complete`
- `max_players` = `12`
- `starting_balance` = `200`
- `house_bet_amount` = `1`
- `timezone` = `America/Los_Angeles`

## 9. Sheet: Phases

Purpose: track tournament phase status.

Recommended columns:

- `phase_id`
- `phase_name`
- `phase_order`
- `status`
- `first_match_time`
- `lock_time`
- `opened_at`
- `locked_at`
- `settled_at`

Allowed phase statuses:

- `future`
- `open`
- `locked`
- `settled`

For the first prototype, only `Group Matchday 1` must work end to end.

## 10. Sheet: Teams

Purpose: store team display data and image paths.

Initial source file:

- `world_cup_cash_all_teams_v1.csv`

Recommended columns:

- `team`
- `fifa_rank`
- `nickname`
- `star_player`
- `star_player_position`
- `team_slug`
- `flag_image`
- `emblem_image`
- `star_player_image`

The `team_slug` should be the stable ID used throughout the app.

## 11. Sheet: Matches

Purpose: store schedule, teams, odds, and results.

Initial source file:

- `world_cup_cash_all_matches_odds_v1.csv`

Recommended columns:

- `phase`
- `match_id`
- `match_date_time`
- `team_a`
- `team_b`
- `team_a_decimal_odds`
- `team_b_decimal_odds`
- `draw_decimal_odds`
- `team_a_goals`
- `team_b_goals`
- `team_advanced`
- `status`

Recommended match statuses:

- `future`
- `open`
- `locked`
- `final`
- `settled`

For group-stage phases, required odds before opening:

- `team_a_decimal_odds`
- `team_b_decimal_odds`
- `draw_decimal_odds`

For knockout phases, required odds before opening:

- `team_a_decimal_odds`
- `team_b_decimal_odds`

Draw odds are not required for knockout phases.

## 12. Sheet: Players

Purpose: store player profiles and summary balances.

Recommended columns:

- `player_id`
- `device_id`
- `display_name`
- `profile_photo_url`
- `current_balance`
- `pending_bets`
- `available_to_bet`
- `total_winnings`
- `total_losses`
- `wins`
- `losses`
- `draws`
- `joined_at`
- `last_seen_at`
- `is_admin`

For v1, profile photo upload can be delayed if needed. Display name is required.

Every player starts with:

- `current_balance` = `200`
- `pending_bets` = `0`
- `available_to_bet` = `200`
- `wins` = `0`
- `losses` = `0`
- `draws` = `0`

## 13. Sheet: Picks

Purpose: store each player pick for each match.

Recommended columns:

- `pick_id`
- `player_id`
- `match_id`
- `phase`
- `selected_team`
- `total_bet_amount`
- `house_bet_amount`
- `player_cash_stake`
- `decimal_odds`
- `potential_payout`
- `status`
- `created_at`
- `updated_at`
- `settled_at`

Allowed pick statuses:

- `active`
- `won`
- `lost`
- `draw`
- `void`

Rules:

- A player may have only one active pick per match.
- Before phase lock, a player may change the selected team.
- Before phase lock, a player may change the bet amount.
- After phase lock, picks are read-only.
- The scroll wheel starts at `$1`, representing the free house bet.
- `player_cash_stake = total_bet_amount - house_bet_amount`
- `potential_payout = total_bet_amount × decimal_odds`

## 14. Sheet: SettlementLog

Purpose: keep an audit trail of balance changes.

Recommended columns:

- `settlement_id`
- `player_id`
- `match_id`
- `pick_id`
- `settlement_type`
- `starting_balance`
- `player_cash_stake`
- `total_payout`
- `ending_balance`
- `created_at`

Recommended settlement types:

- `win`
- `loss`
- `draw`
- `rounding`
- `reset`

This tab is useful for debugging and explaining balance changes.

## 15. Betting Math

Definitions:

- `Current Balance`: settled balance after completed matches only.
- `Pending Bets`: total player cash stake committed to unresolved picks.
- `Available to Bet`: `Current Balance - Pending Bets`
- `Total Bet Amount`: `$1 house bet + player cash stake`
- `Potential Payout`: `Total Bet Amount × Decimal Odds`

Settlement formula for a winning pick:

```text
New Current Balance = Current Balance - Player Cash Stake + Total Payout
```

Where:

```text
Total Payout = ($1 house money + Player Cash Stake) × Decimal Odds
```

Settlement formula for a losing pick:

```text
New Current Balance = Current Balance - Player Cash Stake
```

Settlement formula for a group-stage draw:

```text
New Current Balance = Current Balance
```

The free `$1` house bet is never subtracted from the player balance.

## 16. Phase Locking

Each phase locks 1 hour before the first match in that phase begins.

Before a phase locks:

- Players can make picks.
- Players can edit picks.
- Players can change bet amounts.
- Leaderboard can show live pending activity.

After a phase locks:

- No new picks are allowed.
- Existing picks cannot be changed.
- Bet amounts cannot be changed.
- Match detail screens become read-only.

## 17. Leaderboard

The leaderboard ranks players by `Current Balance`.

During an active phase, the leaderboard should also show live activity:

- Player name
- Profile photo if available
- Current Balance
- Pending Bets
- Potential Payout
- Win / Loss / Draw record

The leaderboard should not subtract pending bets from Current Balance before match results are settled.

Potential Payout should show `$0` if the player has no unresolved active picks.

## 18. Admin Functions For Prototype

The first prototype should support:

- Open Group Matchday 1
- Lock Group Matchday 1
- Upload or refresh teams data
- Upload or refresh matches data
- Enter or upload Group Matchday 1 results
- Settle Group Matchday 1
- Download/export current matches data
- Reset game before real tournament testing

Admin controls should be available through a separate admin URL, not mixed into the regular player invite flow.

Reset should clear:

- Picks
- Simulated results
- Player records
- Player balances
- Phase progress
- Settlement log

Reset should keep:

- Player accounts
- Player names
- Player profile photos if implemented

## 19. Manual Results Flow

For v1, results are manual.

Admin updates match results by editing the Matches data and saving/uploading it.

For group-stage matches, admin fills:

- `team_a_goals`
- `team_b_goals`

For knockout matches later, admin fills:

- `team_a_goals`
- `team_b_goals`
- `team_advanced`

The app settles bets after final results are present.

No random score generator is needed.

## 20. API Actions

The backend/API should eventually support these actions:

- `getGameState`
- `joinGame`
- `updatePlayer`
- `getMatches`
- `getMatchDetail`
- `savePick`
- `getLeaderboard`
- `openPhase`
- `lockPhase`
- `settlePhase`
- `resetGame`
- `uploadTeams`
- `uploadMatches`
- `downloadMatches`

For the first prototype, the minimum required actions are:

- `getGameState`
- `joinGame`
- `getMatches`
- `savePick`
- `getLeaderboard`
- `settlePhase`

## 21. First Build Milestones

Recommended build order:

1. Create Google Sheet template.
2. Create GitHub account and project repository.
3. Create local app project.
4. Build read-only app shell using sample data.
5. Create Google Apps Script backend.
6. Connect Google Apps Script to Google Sheets.
7. Connect the web app to Google Apps Script.
8. Implement player join flow.
9. Implement Matchday 1 match list.
10. Implement pick saving.
11. Implement live leaderboard.
12. Implement manual result settlement.
13. Publish the player app through GitHub Pages.
14. Test the full Matchday 1 loop on iPhone Safari.

## 22. Out Of Scope For First Prototype

Do not build these yet:

- Native iPhone app
- Android-specific polish
- Real-money betting
- Public leagues
- Multiple family groups
- Buy-back feature
- Private picks
- PIN/password access
- Automated live sports results
- Automated odds lookup
- Full tournament automation
- Profile photo upload, unless it becomes easy after the core loop works
- Final visual polish matching every screen design detail

## 23. Open Technical Decisions

These can be decided during the technical setup phase:

- Exact Google Sheets authentication method
- Whether the app should be installable as a Progressive Web App
- Exact admin URL format
- Exact GitHub repository name

## 24. Future v2 Reminder: Scores And Odds APIs

Before starting v2, review current free or low-cost APIs for:

- World Cup scores
- Final match results
- Fixtures
- Betting odds

The first version should not depend on live APIs. It should use manual Google Sheets / CSV updates.

Before adding automation, compare available API options for:

- 2026 World Cup coverage
- Free-tier limits
- Odds availability
- Score/result reliability
- Terms of use
- Ease of integration with Google Apps Script or the chosen backend

Do not rely on web scraping as the primary live data system. Scraping can be considered only as an admin helper or fallback.
