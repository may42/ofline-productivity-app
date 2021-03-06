;(function(global, $){
    "use strict";

    try {
        var statusInfoSpan = $("#status_info");
        var paper = Raphael("apo", 100, 100);
        var initialSettings = { pomHeight: 5, pomWidth: 30, maxPom: 20 };
        var currentGraphSettings = {}; // will store the state of the current graph (used for expansion)
        var PM = global.ProfileManager;
        var pm = new PM($("#profile_select"));
        pm.profileSwitchCallback = onProfileSwitch;
        var profileList = pm.profileArr.map(function(prof){ return prof.name; }).join(", ");
        var selectedDay; // used for storing link to currently selected day raphael object
        var selection; // used for storing selection rectangle

        $("#copy_btn").click(onCopyBtnClick);
        $("body").keydown(onKeyDown);
        onProfileSwitch(); // draw current profile data

        displayInfo("Successfully loaded profiles: " + profileList);
    } catch(err) { displayInfo(err); }

    var productivityApp = {
        paper: paper,
        profileManager: pm,
        displayInfo: displayInfo,
        selectDay: selectDay,
        moveSelection: moveSelection,
        copyTextToClipboard: copyTextToClipboard
    };
    global.productivityApp = productivityApp;
    return productivityApp;

    function displayInfo(info, consoleOnly) {
        var isError = info instanceof Error;
        if (isError) console.error(info);
        else console.log(info);
        if (consoleOnly) return;
        statusInfoSpan.toggleClass("error", isError);
        statusInfoSpan.text(isError ? "error! " + info.message : info);
    }

    function onProfileSwitch(err) {
        if (err) {
            displayInfo(err);
            return;
        }
        paper.clear();
        try {
            // will assign new settings object to currentGraphSettings variable:
            drawBarGraph(paper, pm.currentProfile, initialSettings);
            displayInfo("Bar graph has been drawn successfully. Profile: " + pm.currentProfile.name);
        }
        catch(err) { displayInfo(err); }
    }

    function onCopyBtnClick() {
        try {
            copyTextToClipboard(PM.stringifyData(pm.currentProfile));
            displayInfo("successfully copied JSON data to the clipboard!");
        } catch(err) { displayInfo(err); }
    }

    function onKeyDown(ev) {
        try {
            if (ev.keyCode >= 37 && ev.keyCode <= 40) ev.preventDefault(); // any arrow
            if (ev.keyCode === 37) moveSelection(-1); // left arrow
            if (ev.keyCode === 39) moveSelection(1); // right arrow
            if (ev.keyCode === 38) incSelectedDayValue(1); // up arrow
            if (ev.keyCode === 40) incSelectedDayValue(-1); // down arrow
            if (ev.altKey) {
                if (ev.keyCode === 46) setSelectedDayValue(null); // Alt Del
                if (ev.keyCode >= 48 && ev.keyCode <= 57)
                    setSelectedDayValue(ev.keyCode - 48); // Alt DIGIT
                //if (ev.keyCode === 189) incSelectedDayValue(-1); // Alt -
                //if (ev.keyCode === 187) incSelectedDayValue(1); // Alt +
            }
        } catch(err) { displayInfo(err); }
    }

    function drawBarGraph(paper, data, settings) {
        // if settings argument is omitted - graph will depend on global variable currentGraphSettings
        // if settings argument is an empty object - it will result in default settings object
        if (settings)
            currentGraphSettings = expandSettings(settings);
        var s = currentGraphSettings;
        var expansionMode = "nextDayToStartFrom" in s && "nextIndToStartFrom" in s;
        stretchPaper(paper, s.initialX + s.weekWidth + s.sidesGap * 2, 1600);

        // if settings.nextDayToStartFrom is defined - then graph is EXPANDED, and not redrawn
        var firDate = expansionMode ? s.nextDayToStartFrom : data.firstDateObj,
            year = firDate.getFullYear(),
            monthLengths = giveMothLengths(year++),
            month = firDate.getMonth(),
            daysLeft = monthLengths[month++] - firDate.getDate(), // number of days before the current month ends
            dayOfWeek = (firDate.getDay() + 6) % 7, // 0=mon ... 5=sat 6=sun
            currentDayInd = (new Date() - firDate) / (1000 * 60 * 60 * 24) ^ 0;
        if (!expansionMode && currentDayInd < 0) currentDayInd = 0;
        var amountOfDays = Math.max(data.dataArr.length, currentDayInd + 1);

        var xShift = s.sidesGap + s.initialX,
            yShift = s.baseline + s.initialY;

        var i = expansionMode ? s.nextIndToStartFrom : 0;

        // loop will generate additional days to end with a full week
        for (; i < amountOfDays || dayOfWeek; i++) {

            var color = "transparent",
                x = xShift + dayOfWeek * s.pomWidth,
                y = yShift,
                w = s.pomWidth,
                h = s.pomHeight * s.maxPom;

            if (data.dataArr[i] === undefined) data.dataArr[i] = null;
            var val = data.dataArr[i];
            if (typeof val === "number" && isFinite(val)) {
                val = val ^ 0;
                if (val in s.colors) color = s.colors[val];
                else throw new Error("can't get color, illegal prod value: " + val);
                if (val < s.maxPom) h = s.pomHeight * val || 1;
            } else val = null;
            if (s.direction === -1) y -= h;
            var rect = paper.rect(x, y, w, h)
                            .attr({stroke: "none", fill: color})
                            .data("dayInd", i);
            if (i === currentDayInd)
                var dayToBeSelected = rect; // raphael object, that will be selected after the loop

            dayOfWeek = (dayOfWeek + 1) % 7;
            if (dayOfWeek === 0) {
                drawGrid();
                yShift += s.weekHeight;
            }
            if (daysLeft === 0) {
                if (month === 12) {
                    month = 0;
                    monthLengths = giveMothLengths(year++);
                }
                daysLeft = monthLengths[month++];
                // todo: month columns
                if (s.monthGap) {
                    drawGrid();
                    yShift += s.weekHeight;
                }
            }
            daysLeft--;

        }
        if (dayToBeSelected)
            selectDay(dayToBeSelected);
        // this way current xShift and yShift will be stored in currentGraphSettings variable:
        s.initialX = xShift - s.sidesGap;
        s.initialY = yShift - s.baseline;
        // graph EXPANSION will continue from the point, where last loop ended:
        s.nextIndToStartFrom = i;
        s.nextDayToStartFrom = incDate(new Date(data.firstDateObj), i);

        function drawGrid() {
            var strokeWidth = 1;
            var strokeColor = "#000";
            var x = xShift - s.sidesGap / 2;
            var y = yShift;
            var l = s.weekWidth + s.sidesGap;
            var h = s.pomHeight * s.direction;
            for (var i = 0; i < s.maxPom; i++, y+=h) {
                var opacity = i % 5 ? 0.1 : i % 10 ? 0.25 : 0.5;
                paper.path("M" + x + "," + y + " l" + l + ",0")
                    .attr({stroke: strokeColor, "stroke-width": strokeWidth, "stroke-opacity": opacity});
            }
        }

        function expandSettings(settings) {
            if (!settings || typeof settings !== "object") settings = {};
            var s = {}; // resulting settings object
            s.initialX = settings.initialX || 0;
            s.initialY = settings.initialY || 0;
            s.colors = settings.colors || ("#000000,#600000,#800000,#A80000,#D30000,#FF0000,#FF6400," +
                   "#FF9400,#FFC800,#FFFF00,#A8FF00,#00FF00,#00DF00,#00BF00,#009700,#007000,#005A4A," +
                   "#004088,#0020CC,#0000FF,#0064FF,#0094FF,#00CCFF,#00FFFF,#9FFFFF").split(",");
            s.maxPom = settings.maxPom || 25;
            s.pomWidth = settings.pomWidth || 5;
            s.pomHeight = settings.pomHeight || 5;
            s.direction = settings.direction || -1; // -1: from bottom to top, 1: from top to bottom
            s.sidesGap = settings.sidesGap || settings.pomWidth; // gaps to all 4 directions from the graph
            s.monthGap = !!settings.monthGap; // vertical gap between months
            // todo: s.monthsColumn = settings.monthsColumn || -1; // 1: horizontal, n: months columns of size n, -1: vertical

            // additional values:
            s.weekWidth = s.pomWidth * 7;
            s.weekHeight = s.pomHeight * s.maxPom;
            s.baseline = s.sidesGap + (s.direction === -1 ? s.weekHeight : 0);
            return s;
        }
    }

    function stretchPaper(paper, w, h) {
        if (paper.width > w) w = paper.width;
        if (paper.height > h) h = paper.height;
        paper.setSize(w, h);
    }

    // must be initiated by a user action
    function copyTextToClipboard(text) {
        var t = $("<textarea>", {style:"position:fixed; left:-30px; width:10px; height:10px;"});
        var success = false;
        t.val(text).prependTo('body').select();
        try { success = document.execCommand('copy'); }
        finally { t.remove(); }
        if (success) return "successfully copied to the clipboard: " + text;
        else throw new Error("can't copy! check if function call is initiated by a user action");
    }

    function giveMothLengths(year) {
        // nDays = month === 1 ? 28 + leap : 31 - month % 7 & 1;
        var months = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
        if (!(year % 4) && year % 100 || !(year % 400)) months[1]++;
        return months;
    }

    function selectDay(day) {
        // visually selects given rect element
        // day argument accepts SVG rect Elements, raphael rect objects, jquery rect objects
        // todo: accept date string or Date object

        var errorMsg = "day argument must be a rect element (SVGElement, $ or Raphael object)";

        if (!day || typeof day !== "object") throw new SyntaxError(errorMsg);
        if (day.constructor.prototype == Raphael.el) day = day.node;
        if (day instanceof $) day = day.get(0);
        if (!(day instanceof SVGElement) || day.nodeName !== "rect") throw new SyntaxError(errorMsg);
        if (typeof day.raphaelid !== "number")
            throw new SyntaxError("day rect element must be bound to some Raphael paper");

        selectedDay = day;
        if (selection) selection.remove();
        // selection object is a rect element clone, that is automatically moved to the top by Raphael
        selection = paper.getById(selectedDay.raphaelid).clone()
                         .attr({stroke: "#e3d", fill: "rgba(240,50,220,.3)", "stroke-width": "3px"});
    }

    function moveSelection(dist) {
        // dist accepts 1 and -1, for next and previous day respectively
        // todo: accept any integer

        var rectGroup;
        var leadingRectangles = 0;
        var trailingRectangles = 1; // 1 is for selection rect itself
        if (dist === -1) {
            rectGroup = $(selectedDay).prevAll("rect");
            if (rectGroup.length <= leadingRectangles) return;
        } else if (dist === 1) {
            rectGroup = $(selectedDay).nextAll("rect");
            if (rectGroup.length <= trailingRectangles) {
                pm.currentProfile.dataArr.length += 7; // generate new week
                drawBarGraph(paper, pm.currentProfile); // expansion mode, currentGraphSettings will be used
                if (selection) selection.remove();
                rectGroup = $(selectedDay).nextAll("rect"); // capture new rect elements
            }
        } else throw new SyntaxError("x argument must be equal to -1 or 1");
        selectDay(rectGroup.get(0)); // selects next/prev day only if it exists
    }

    function setSelectedDayValue(val) {
        if (val != null && (typeof val !== "number" || !isFinite(val)))
            throw new TypeError("val must be an integer, undefined or null");
        var raphaelObj = paper.getById(selectedDay.raphaelid);
        if (!raphaelObj)
            throw new ReferenceError("selectedDay element must be bound to some Raphael paper");
        var s = currentGraphSettings;
        var dataArr = pm.currentProfile.dataArr;
        var dayInd = raphaelObj.data("dayInd");
        if (!(dayInd in dataArr))
            throw new Error("can't find such dayInd in current profile dataArr: " + dayInd);

        var oldHeight = raphaelObj.attr("height"),
            oldYPos = raphaelObj.attr("y");
        if (s.direction === -1) oldYPos += oldHeight; // restore old y origin point

        var color = "transparent", // rgba(0,0,0,0)
            y = oldYPos,
            h = s.pomHeight * s.maxPom;

        if (val < 0) val = null;
        if (val != null) {
            val = val ^ 0;
            var maxVal = s.colors.length - 1;
            if (val > maxVal) {
                displayInfo("can't exceed value " + maxVal + " with current settings");
                val = maxVal;
            }
            color = s.colors[val];
            if (val < s.maxPom) h = s.pomHeight * val || 1;
        }
        if (s.direction === -1) y -= h;

        if (color !== "transparent") // reset the transparent element
            $(raphaelObj.node).removeAttr("fill-opacity");
        raphaelObj.attr({y: y, height: h, fill: color});

        dataArr[dayInd] = val;
        selectDay(raphaelObj);
        pm.saveCurrentProfile();
    }

    function incSelectedDayValue(n) {
        if (n === 0) return;
        if (typeof n !== "number" || !isFinite(n))
            throw new TypeError("n must be an integer");
        var raphaelObj = paper.getById(selectedDay.raphaelid);
        if (!raphaelObj)
            throw new ReferenceError("selectedDay element must be bound to some Raphael paper");
        var oldValue = pm.currentProfile.dataArr[raphaelObj.data("dayInd")];
        setSelectedDayValue(+oldValue + n);
    }

})(window, window.jQuery);
