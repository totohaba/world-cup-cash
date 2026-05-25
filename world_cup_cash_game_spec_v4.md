## World Cup Cash — Game Specification v4
### 1. Game Overview
World Cup Cash is a simple mobile game for a private family group of up to 12 players.
The game is based on the 2026 soccer World Cup. Players predict the outcome of matches across the full tournament, starting with group play and continuing through the Final.
Each player starts with $200 in imaginary money. Players use that money to place optional fake-money bets on match outcomes. Each submitted pick also includes a free $1 house bet so casual players can participate without risking their own balance.
The winner is the player with the highest Current Balance after the Final.
This is not a real-money gambling app. All money in the game is imaginary.

### 2. Core Game Objective
Players try to finish the tournament with the most fake money.
Players increase their balance by correctly picking match winners. Players lose money only when they choose to add their own fake cash to a pick and that pick loses.
Every submitted pick includes a free $1 house bet. The player never loses this $1. If the pick wins, the payout from the $1 house bet is added to the player’s Current Balance.

### 3. Player Setup
#### 3.1 New Player Welcome
When a new player first opens the game, they see a welcome screen.
The welcome screen asks the player to enter:
Player name
Optional profile photo
After setup, that player profile is tied to that phone/device.
#### 3.2 One Player Per Device
Each phone should only have one player profile associated with it.
If a device already has a player profile and opens an invite link, the app should return that player to the existing family game instead of creating a duplicate player.
#### 3.3 Late Joiners
Players may join late.
Late joiners start with $200, but they can only bet on future phases that have not locked yet. They cannot place retroactive bets on locked or completed phases.

### 4. Game Structure
The game is a single private family game.
There is no need for multiple leagues or public game rooms in the first version.
The game should support up to 12 players.

### 5. Tournament Phases
The game is organized by tournament phase.
The phases are:
Group Matchday 1
Group Matchday 2
Group Matchday 3
Round of 32
Round of 16
Quarterfinals
Semifinals
Third-place match
Final
Only the current active phase should be shown as the primary set of matches available for betting.
Past phases should be available for review.
Future phases should not open for betting until the admin opens that phase.

### 6. Phase Locking
Betting locks at the phase level.
Each phase locks 1 hour before the first match of that phase begins.
Once a phase locks:
No new picks can be made for that phase
Existing picks cannot be changed
Bet amounts cannot be changed
The phase status becomes locked
Before a phase locks, players can:
Choose a team
Change their selected team
Add fake cash to a pick
Increase or decrease added fake cash
Remove added fake cash back to $0
Leave only the free $1 house bet in place

### 7. Balance Definitions
The app should use consistent balance language throughout.
#### 7.1 Current Balance
The player’s settled cash balance after completed matches only.
This is the main number used to rank players on the leaderboard.
Every player starts with:
Current Balance: $200
#### 7.2 Pending Bets
The amount of the player’s own fake cash currently committed to unresolved bets.
Pending Bets do not include the free $1 house bet.
#### 7.3 Available to Bet
The amount of fake cash the player can still add to unresolved bets.
Formula:
Available to Bet = Current Balance - Pending Bets
This prevents players from committing the same money to multiple unresolved bets.
#### 7.4 Potential Payout
The total payout a player would receive if their current unresolved bets win.
Use the phrase Potential Payout everywhere. Do not use “Potential Winnings.”
Formula:
Potential Payout = Total Bet Amount × Decimal Odds
The total bet amount includes:
$1 house money
Any additional fake cash added by the player
Potential Payout should show cents during the current phase.
Example:
If a player bets $11 total at 1.50 odds:
Potential Payout = $16.50
Settlement Formula
When a picked team wins, the app should settle the bet using this formula:
New Current Balance = Current Balance - Player Cash Stake + Total Payout
Player Cash Stake means only the player’s added fake cash. It does not include the free $1 house bet.
Total Payout = ($1 house money + Player Cash Stake) × Decimal Odds
If a player loses, subtract only the Player Cash Stake from Current Balance. The free $1 house bet is never subtracted.
If a group-stage match ends in a draw, do not add or subtract money. Clear the player’s pending bet for that match.
#### 7.5 Total Winnings
The total payout received from winning bets across completed matches, including payouts from the free $1 house bet and any player cash stake.
#### 7.6 Total Losses
The total player cash stake lost from losing bets across completed matches.
The free $1 house bet is never counted as a player loss.

### 8. Betting Rules
#### 8.1 Required Pick
Players do not have to pick every match.
If a player does not make a pick:
No bet is placed
No $1 house bet is activated
No win, loss, or draw is added to the player’s record
#### 8.2 Free $1 House Money
Every submitted pick includes free $1 house money.
The player never loses this $1.
If the pick wins, the payout from the $1 house money is added to the player’s Current Balance.
The $1 house money exists to make the game fun and low-risk for casual players.
#### 8.3 Adding Player Cash
After choosing a team, the player can optionally add fake cash from their Available to Bet balance.
Players can only add whole-dollar amounts.
No cents are allowed.
Players may choose to add $0 and rely only on the free $1 house bet.
#### 8.4 Maximum Added Cash
A player cannot add more fake cash than their Available to Bet balance.
If a player has no Available to Bet balance, they can still make picks using only the free $1 house bet.
#### 8.5 Cents and Rounding
Potential Payout should include cents during the current phase.
When match results are settled, player balances may temporarily include cents for the rest of that phase.
At the start of the next phase, each player’s Current Balance should be rounded up to the nearest whole dollar.
After rounding, Current Balance and Available to Bet should display whole dollars again.

### 9. Match Outcome Rules
#### 9.1 Group Stage Matches
For group-stage matches, players pick which team will win.
If the match ends in a draw:
All picks on either team are marked as Draw
No money is won
No money is lost
Pending Bets are cleared for that match
The match adds 1D to the player’s record
#### 9.2 Knockout Matches
For knockout matches, the bet is on which team advances.
A pick wins if the selected team advances, including after:
Regulation time
Extra time
Penalties
A pick loses if the selected team is eliminated.
There are no Draw outcomes in knockout rounds.

### 10. Win / Loss / Draw Record
Player records should use this format:
8W / 5L / 2D
Definitions:
Win: player made a correct pick
Loss: player made an incorrect pick
Draw: group-stage match ended in a draw after the player picked either team
Skipped match: not counted

### 11. Odds Rules
Odds are decimal odds.
Example:
If a player bets $10 total at 2.3 odds:
Potential Payout = $10 × 2.3 = $23.00
Odds are fixed for the entire phase once that phase opens.
Everyone bets against the same odds for that phase.
Odds should not keep updating after the phase opens.
#### 11.1 Win Probability
The betting screen should show each team’s calculated win probability based on betting odds.
For group-stage matches, the calculation should account for the probability of a draw.
This means Team A win probability plus Team B win probability will usually total less than 100% because the remaining probability belongs to the draw.
The app does not need to show draw odds on the betting screen, but draw odds are required for group-stage phases before that phase can open so win probabilities can be calculated correctly.

### 12. Game Data
The app should use preloaded supporting data.
The admin must be able to upload or update supporting data before each round.
There should be two CSV uploads:
Team / match information CSV
Betting odds CSV
#### 12.1 All Teams CSV
The admin should upload one team information CSV named:
world_cup_cash_all_teams_v1.csv
This file should include one row per team.
Required columns:
Team
FIFA rank
Nickname
Star player
Star Player Position
Team Slug
Flag Image
Emblem Image
Star Player Image
This file is used to power team profile information across the app, including match cards, match detail screens, flags, emblems, nicknames, and star player details.
#### 12.2 Betting Odds / Match CSV
This file should include match-level odds for the current phase.
Data may include:
Phase
Match ID
Match date/time
Team A
Team B
Team A decimal odds
Team B decimal odds
#### 12.3 Images
Images can be collected in a shared folder structure before being uploaded to the app’s storage.
Recommended folder structure:
World Cup Cash Assets
├── flags
├── emblems
└── players
Recommended file naming:
flags/mexico.png
emblems/mexico.png
players/mexico_santiago-gimenez.png
The CSV should reference these filenames or paths.

### 13. Main App Sections
The app should include these main player-facing sections:
Home / Matches
Leaderboard
My Profile
Rules
Final Winner screen
The app should also include an admin-only section.

### 14. Home / Matches Section
The Home / Matches section is the main place players go to see the current phase and place picks.
It should include:
Current phase name
Phase progress tracker
Phase lock date and time
List of matches in the active phase
Pick status for each match
#### 14.1 Phase Progress Tracker
Show the tournament phases in order:
MD1 → MD2 → MD3 → R32 → R16 → QF → SF → 3rd Place → Final
The tracker should clearly show:
Completed phases
Current phase
Future phases
#### 14.2 Phase Lock Date and Time
Instead of a live countdown, show the exact date and time when the current phase will lock.
All lock times should be displayed in Pacific Time.
Use clear, planning-friendly language.
Examples:
“Locks: June 10 at 11:00 AM PT”
“Locks: June 17 at 8:00 AM PT”
“Phase locked”
The app should calculate the lock time as 1 hour before the first match of the phase begins, then display that lock time in Pacific Time.
#### 14.3 Match List
The match list should show upcoming games for the active phase only.
For group play, matches should be grouped by group assignment.
After group play, matches should be listed by scheduled playing time.
Each match row should show:
Team names
Flag icons or flag images
Match time
Pick status
#### 14.4 Pick Status
Each match should show one of these statuses:
Not Picked
Picked
Locked
Won
Lost
Draw

### 15. Match Betting Screen
Players can tap a match to open the betting screen.
#### 15.1 Team Information
The betting screen should show both teams side by side.
For each team, show:
Team emblem image
Country/team name
FIFA rank
Emoji flag icon
Decimal betting odds
Calculated percentage chance based on betting odds
Team nickname
Star player name
Star player position
Star player profile photo
Player profile photos should ideally use a white background and be zoomed in on the player’s head.
#### 15.2 Picking a Team
Below each team’s information, show a button to choose that team.
When a team is selected:
The selected button state should clearly change
The screen should show the total amount bet
The screen should show the Potential Payout
#### 15.3 Choosing Bet Amount
After selecting a team, the player chooses the total bet amount using a vertical scroll wheel.
The scroll wheel should use whole-dollar increments.
The scroll wheel should start at $1, representing the free $1 house money.
There should not be a $0 option on the scroll wheel.
The maximum scroll wheel value should be:
$1 house money + player’s Available to Bet balance
The Potential Payout should update dynamically as the bet amount changes.
The Potential Payout should also update dynamically if the player switches from one team to the other, because each team may have different betting odds.
The interface should include enough margin between the scroll wheel and the Place Bet button so players do not accidentally place a bet while adjusting the amount.
#### 15.4 Editing Picks
Before the phase locks, players can edit:
Selected team
Added cash amount
After the phase locks, the betting screen becomes read-only for that phase.
#### 15.5 Navigation
Players should be able to:
Swipe left or right to move to the previous or next match in the phase
Tap an X in the top right corner to return to the match list
#### 15.6 Post-Phase Activity Info
After a phase ends, match pages should show the player’s activity for that match.
Show:
Player’s pick
Amount bet
Match result
Win, Loss, or Draw status
Payout or loss
Example:
Pick: Mexico
Bet: $1 house + $10 player cash
Result: Mexico won
Status: Won
Payout: $17

### 16. Leaderboard
The leaderboard ranks players by Current Balance.
Highest Current Balance appears at the top.
Each player row should show:
Player name
Profile photo
Current Balance
Win / Loss / Draw record
Potential Payout
If a player has no unresolved bets, Potential Payout should show $0.
The leaderboard should not subtract pending bets from Current Balance before match results are resolved.

### 17. My Profile Section
The profile section should show:
Player name
Profile photo
Current Balance
Available to Bet
Pending Bets
Total Winnings
Total Losses
Win / Loss / Draw record by match
Players should be able to:
Update their name
Upload or change their profile photo from their iPhone
The buy-back feature should not exist.

### 18. Rules Page
The app should include a simple Rules page.
The rules page should explain:
#### 18.1 How to Win
Win the most fake money by correctly picking World Cup match winners.
The player with the highest Current Balance after the Final wins.
#### 18.2 Starting Balance
Every player starts with $200 in imaginary money.
#### 18.3 House Bet
Every submitted pick includes a free $1 house bet.
The player never loses this $1.
If the pick wins, the payout is added to the player’s Current Balance.
#### 18.4 Adding Cash
Players may add available fake cash to a pick, but they do not have to. This does not add money to the player’s account; it only increases the amount risked on that pick.
#### 18.5 Phase Locking
Each phase locks 1 hour before the first match of that phase begins.
After a phase locks, picks and bet amounts cannot be changed.
#### 18.6 Group-Stage Draws
If a group-stage match ends in a draw, picks on either team are marked as Draw.
No money is won or lost.
#### 18.7 Knockout Rounds
In knockout rounds, the pick is for the team that advances.
Extra time and penalties count.
#### 18.8 Odds Explanation
Lower odds usually mean a safer pick with a smaller payout.
Higher odds usually mean a riskier pick with a bigger payout.
#### 18.9 Tie-Breakers
Final ranking uses these rules:
Highest Current Balance wins
If tied, most correct picks wins
If still tied, players share the championship

### 19. Final Winner Screen
After the Final is complete and results are settled, the app should show a final winner screen to all players.
The screen should show:
Winner name
Winner profile photo
Final Current Balance
Final Win / Loss / Draw record
If players are tied after applying the tie-breaker rules, the screen should show shared champions.
Do not add extra award categories such as Biggest Upset, Best Bet, or Wooden Spoon.

### 20. Admin Role
The game should include an admin-only section.
The admin can:
Generate invite links for new players
Upload teams CSV
Upload matches CSV
Edit supporting data if something is wrong
Open the next phase
Lock the current phase
Check for betting odds for the next phase
Update real match scores automatically after matches begin
Finalize match results
Reset the game
#### 20.1 Admin Invite Links
The admin can generate invite links for new players.
Opening an invite link should allow a new player to join the family game.
If the device already has a player profile, opening the link should return that player to the existing game instead of creating a duplicate.
#### 20.2 Admin Data Upload
The admin screen should include two separate upload buttons:
Upload Teams
Upload Matches
#### 20.2.1 Upload Teams
The Upload Teams button lets the admin upload the team information CSV.
Expected file:
world_cup_cash_all_teams_v1.csv
This file should include one row per team and should use these columns:
Team
FIFA rank
Nickname
Star player
Star Player Position
Team Slug
Flag Image
Emblem Image
Star Player Image
The app should use this file for team-level information across the game, including names, rankings, nicknames, star players, and image paths.
#### 20.2.2 Upload Matches
The Upload Matches button lets the admin upload the match, odds, and results CSV.
Expected file:
world_cup_cash_all_matches_odds_v1.csv
This file should include one row per match and should use these columns:
Phase
Match ID
Match date/time
Team A
Team B
Team A decimal odds
Team B decimal odds
Draw decimal odds
Team A goals
Team B goals
Team advanced
For group-stage matches, Team A and Team B should use team slugs.
For future knockout matches before teams are known, Team A and Team B may use TBD.
The final three columns should remain blank until match results are entered or simulated:
Team A goals
Team B goals
Team advanced
The app should use this file for the match schedule, phase structure, betting odds, draw odds, match results, and which team advanced.
#### 20.3 Admin Editing
The admin should be able to manually edit uploaded data if something is wrong.
This is important because the app should not depend entirely on live external data APIs.
#### 20.4 Admin Simulation and Results Updates
The app should not include an auto-generate random scores option.
For beta testing and simulation, the admin should update match results by editing and re-uploading the matches CSV.
To simulate results, the admin should:
Download or edit the matches CSV
Fill in Team A goals and Team B goals
Fill in Team advanced for knockout-stage matches when relevant
Re-upload the matches CSV using Upload Matches
Let the app detect the updated results and settle bets
This beta testing flow should mirror the real game flow as closely as possible.
#### 20.4.1 Automatic Real Match Score Updates
After the real World Cup begins, the app should attempt to update scores automatically.
The app should check for final results starting 3 hours after each match begins.
If the match is not final yet, the app should continue checking every 15 minutes until a final result is available.
When a final result is found, the app should update both:
The app’s internal database
The current matches CSV / exportable matches data
For group-stage matches, the app should update:
Team A goals
Team B goals
For knockout-stage matches, the app should update:
Team A goals
Team B goals
Team advanced
For knockout matches decided by penalties, Team advanced should identify the team that advanced. The score columns can show the official match score, while Team advanced determines the betting result.
#### 20.5 Opening the Next Phase and Odds Lookup
When the admin taps Open Next Phase, the app should:
Identify the next tournament phase
Confirm the matchups for that phase are known
Attempt to find current betting odds for each match in that phase
Update the app’s internal database with the odds found
Update or regenerate the matches CSV / exportable matches data
Alert the admin if odds are missing or could not be found
The app should use this hierarchy for odds data:
Try automated odds lookup
If successful, update the internal database and matches CSV
If unsuccessful, alert the admin
Admin fixes the issue by re-uploading the matches CSV with the correct odds
If teams are still TBD for a phase, the app should not fully open that phase.
If betting odds are missing, the app should show an alert before opening the phase.
A phase cannot open until every match in that phase has the required odds data.
For group-stage phases, required odds data means Team A decimal odds, Team B decimal odds, and Draw decimal odds.
For knockout phases, required odds data means Team A decimal odds and Team B decimal odds. Draw decimal odds are not required because knockout picks are based on which team advances.
Recommended alert copy:
Odds Not Found
“We could not find betting odds for some matches in this phase. Please upload an updated matches CSV before opening this phase.”
The phase should not open silently when required odds are missing.
#### 20.6 CSV and Database Sync
The app should use a hybrid data model.
The uploaded CSV files are the admin-facing source of truth because they are easy to inspect, edit, re-upload, and back up.
The internal database is the app-facing source of truth because it is faster and safer for gameplay, betting logic, balance calculations, lock states, and leaderboards.
When the admin uploads a CSV, the app should import the CSV into the internal database.
When the app automatically finds odds or match scores, it should update the internal database and also update or regenerate the matches CSV / exportable matches data.
The admin should be able to download the current matches CSV at any time, including any automatically updated odds, scores, and advancement results.
#### 20.7 Admin Reset
The admin can reset the game before the real World Cup begins.
Reset should clear gameplay and tournament test data:
All bets
Simulated results
Player records
Player balances
Phase progress
Reset should keep player identity data:
Player accounts
Player names
Player profile photos

### 21. Beta Testing
The app should support a beta test before the real World Cup.
Beta testing should allow the admin to:
Invite players
Upload test match data
Open a test phase
Let players place bets
Lock the phase
Update test results by editing and re-uploading the matches CSV
Settle results
Move through additional test phases
Reset the game before the real tournament
This allows the family to test the full game flow before the World Cup starts without using a random score generator.

### 22. Important Exclusions for v1
The first version should not include:
Real-money betting
Public leagues
Multiple family groups
Buy-back feature
Side award categories
Live odds changes after a phase opens
Required betting on every match
Real-time sports API dependency as a core requirement

### 23. Product Principle
The game should feel simple, casual, and fun.
It should be easy enough for casual soccer fans to play, but strategic enough for competitive family members to care about the leaderboard.
The $1 house bet is important because it lets every player keep participating all the way through the Final, even if they lose all of their own fake cash.
