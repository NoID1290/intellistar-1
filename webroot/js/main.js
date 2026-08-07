$(function(){
	var $main = $("#main"),
		$window = $( window ),
	    mainHeight = $main.outerHeight(),
	    mainWidth = $main.outerWidth();
	$(window).resize(() =>{
		scaleWindow();
	});

	function scaleWindow() {
		var scaleX, scaleY, windowAspect;
		var targetAspect = 16 / 9;
		var baseAspect = mainWidth / mainHeight; // 1620 / 1080 = 1.5
		var stretchX = targetAspect / baseAspect; // 32 / 27 (~1.185185)

		windowAspect = $window.width() / $window.height();
		if (windowAspect >= targetAspect) {
			scaleY = $window.height() / mainHeight;
			scaleX = scaleY * stretchX;
		} else {
			scaleX = $window.width() / (mainWidth * stretchX);
			scaleY = scaleX / stretchX;
		}

		$main.css({
			transform: "translate(-50%, -50%) " + "scale(" + scaleX + ", " + scaleY + ")"
		});
		$(".container").css({
			transform: "translate(-50%, -50%) " + "scale(" + scaleX + ", " + scaleY + ")"
		});
	}
	scaleWindow();

});

const CANADIAN_PROVINCES = ["AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU", "ON", "PE", "QC", "SK", "YT"];

function isMetric() {
    if (typeof appearanceSettings !== "undefined" && appearanceSettings.units === "metric") return true;
    if (typeof appearanceSettings !== "undefined" && appearanceSettings.units === "imperial") return false;
    if (typeof locationConfig !== "undefined" && locationConfig.mainCity) {
        var country = locationConfig.mainCity.country;
        var state = locationConfig.mainCity.state;
        if (country === "Canada" || country === "CA" || CANADIAN_PROVINCES.includes(state)) {
            return true;
        }
    }
    return false;
}

function getUnits() {
    return isMetric() ? "m" : "e";
}
