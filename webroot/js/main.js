$(function(){
	var $main = $("#main"),
		$window = $( window ),
	    mainHeight = $main.outerHeight(),
	    mainWidth = $main.outerWidth();
	$(window).resize(() =>{
		scaleWindow();
	});

	function scaleWindow() {
		var scale, windowAspect;

		windowAspect = $window.width() / $window.height();
		if (windowAspect>=(3/2)) {
			scale = $window.height() / mainHeight;
		} else {
			scale = $window.width() / mainWidth;
		}

		$main.css({
			transform: "translate(-50%, -50%) " + "scale(" + scale + ")"
		});
		$(".container").css({
			transform: "translate(-50%, -50%) " + "scale(" + scale + ")"
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
