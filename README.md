# IntelliStar Simulator 

**IntelliStar Simulator** is a simulated recreation of "Local On The 8s" by The Weather Channel in HTML/CSS/JS, as seen from 2007 to 2008, by ***mist weather media***

Online version: [i1.weatherstar.dev](https://i1.weatherstar.dev)

© Mist Weather Media 2025.

------------

**Special thanks to these talented minds who made this project possible!**

**JensonWX** - Lead Developer  
**Miceoroni** - Developer (Advanced Settings)   
**zachNet** - README

and the rest of the Mist Creative Team for their support!

------------

Need support beyond the scope of this README? Have any questions? Feel free to join our Discord for support!

[***mist weather media*** on Discord](https://discord.gg/hV2w5sZQxz)

------------

Are you a developer? Pull requests are welcome! If you find a bug and fix it yourself, submit one with the fixed code and it may be merged into the main branch!

# Initial Setup

1. Install [node.js LTS](https://nodejs.org/en/).
2. Run `install.bat` *(`install.sh` on macOS/Linux)*. This will install all dependencies required to run.
3. Run `start.bat` *(`start.sh` on macOS/Linux)*. This will start a local web server (defaulting to port 7070).

------------

You're all set. Enjoy!

Many thanks for using our simulator! We hope you like it.

## IPTV On Linux ARM

`npm run start-iptv` uses Puppeteer for the headless renderer. On Raspberry Pi and other Linux ARM hosts, the Puppeteer-managed browser cache may be incompatible with the host binary format.

If IPTV fails while launching Chrome, install a system Chromium build and point the stream launcher at it:

```sh
sudo apt install chromium-browser
STREAM_BROWSER_PATH=/usr/bin/chromium-browser npm run start-iptv
```

`STREAM_BROWSER_PATH` may also be set to `chromium-browser` or `chromium` if the browser is already on your `PATH`.

## Alert Test Triggers

You can now force alert tests without waiting for live data, including Quebec En Alerte-style government/public safety alerts.

1. Configure default behavior in `webroot/js/config.js` with `alertTestSettings`.
2. Use URL parameters:
	- `?alertTest=tornado`
	- `?alertTest=all`
	- `?alertTest=quebec`
	- `?alertTestCrawl=false` (optional)
3. Use browser console commands at runtime:
	- `alertTest.trigger('tornado')`
	- `alertTest.trigger('Alerte de tornade')`
	- `alertTest.triggerAll()`
	- `alertTest.triggerQuebec()`
	- `alertTest.listTypes()`
	- `alertTest.clear()`
4. Use the Settings UI "Alert Test" controls:
	- Pick a disaster type and click **Run**
	- Click **All** to run all disaster test types
	- Click **Quebec** for Quebec En Alerte (government/public safety, including AMBER-style) test set
	- Click **Clear** to return to live alerts
