# Installing a Laqta test build

Laqta turns a screenshot and one sentence into a Jira bug. A test build is not signed by a
company certificate yet, so your computer asks once whether you trust it. These steps take
about ten minutes.

## What you need

- A Jira account: the address of your Jira (for example `https://yourteam.atlassian.net`)
  and a token.
  - **Jira Cloud** (`…atlassian.net`): your account email and an API token from
    <https://id.atlassian.com/manage-profile/security/api-tokens>.
  - **Jira Data Center / Server**: a personal access token from your Jira profile.
- **Claude Code**, logged in with your own Claude account. Laqta uses it to write the draft;
  it does not need or store any AI key.
  1. Install it from <https://claude.com/claude-code>.
  2. Open a terminal (macOS: Terminal, Windows: PowerShell), type `claude`, press Enter and
     log in. You can close it afterwards.

## macOS

1. Open `Laqta-…-mac-universal.dmg` and drag **Laqta** into **Applications**.
2. The first time, macOS blocks apps that are not notarized. Open Terminal and run:

   ```
   xattr -cr /Applications/Laqta.app
   ```

   Then open Laqta from Applications. (Or: right-click Laqta › **Open** › **Open**; on newer
   macOS go to System Settings › Privacy & Security and click **Open Anyway**.)

3. Laqta lives in the **menu bar** (top right), not the Dock. Settings opens by itself the
   first time.
4. If macOS asks to use "Laqta Safe Storage" in your keychain, click **Always Allow**. That is
   where your Jira token is kept, encrypted.
5. The first capture asks for **Screen Recording** permission: allow it in System Settings ›
   Privacy & Security › Screen Recording, then quit and reopen Laqta.

## Windows

1. Run `Laqta-…-win-x64.exe`.
2. Windows SmartScreen says "Windows protected your PC". Click **More info** › **Run anyway**.
3. Laqta lives in the **system tray** (bottom right, maybe under the `^` arrow). Settings
   opens by itself the first time.

## Set it up

In **Settings**:

1. **Jira**: choose Data Center or Cloud, enter the address and token (and email for Cloud),
   press **Test connection**, then **Save and continue**.
2. **AI**: choose **Claude Code**, then **Save**.

## Use it

Press **Control+Shift+J** (any app), drag over the problem, press Enter, write one sentence,
and press **Generate draft**. Check the draft, then **Create bug**. Nothing is written to Jira
until you click Create bug. You can change the shortcut in Settings › Capture.

## If something goes wrong

- **"AI unavailable"**: open a terminal and run `claude` to check you are still logged in.
- **No tray / menu bar icon** on a Mac with a notch: the icon can hide behind the notch when
  the active app has many menus. Use the shortcut, or switch to Finder.
- Logs (no tokens, screenshots or text are ever written there): macOS
  `~/Library/Application Support/Laqta/logs/laqta.log`, Windows
  `%APPDATA%\Laqta\logs\laqta.log`.
