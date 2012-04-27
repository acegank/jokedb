var CLIENT_VERSION = 3,
    EVENTS = {},
    TIMEOUTS = {},
    EXPANDED_PROJECTS = {},
    LOCALSTORAGE_EXPANDED_PROJECTS = {},
    ANIMATION_SPEEDS = {
        zoom: 150,
        children: 100
    },
    PROJECTID_TO_PROJECT_MAP = {},
    DELETED_PROJECTID_TO_PROJECT_MAP = {},
    PENDING_OPERATION_QUEUE = [],
    IN_FLIGHT_OPERATION_QUEUE = [],
    PENDING_OPERATION_PUSH_DELAY = 5E3,
    TRANSMISSION_FAILURES_SINCE_LAST_SUCCESS = 0,
    PENDING_EXPANDED_PROJECTS_DELTA = {},
    IN_FLIGHT_EXPANDED_PROJECTS_DELTA = {},
    MOST_RECENT_OPERATION_TRANSACTION_ID = null,
    POLLING_INTERVAL_IN_MS = null,
    POLL_IN_PROGRESS = false,
    IS_MOBILE = false,
    IS_IOS = false,
    IS_ANDROID = false,
    IS_FIREFOX = false,
    IS_IE = false,
    DISABLE_EDITING = false,
    NO_ANIMATIONS = false,
    NORMAL_USAGE = false,
    LOCAL_STORAGE_SUPPORTED = false,
    SEARCH_MODE = false,
    SEARCH_TOKEN_REGEXP_LIST = [],
    WINDOW_FOCUSED = true,
    WORD_CHARS = "A-Za-z\\u00C0-\\u02AE",
    WORD_CHARS_PLUS_DIGITS = WORD_CHARS + "\\d",
    URL_REGEXP = RegExp("(https?:\\/\\/([a-z\\d\\-\\.]+)(\\:\\d+)?(\\/[a-z\\d\\/#?&%=~;$\\-_.+!*'(),]*)?)", "ig"),
    TAG_BOUNDARY_CHARS = "[(),.!?;:\\/]",
    TAG_REGEXP = RegExp("(^|\\s|" + TAG_BOUNDARY_CHARS + ")((#|@)([" + WORD_CHARS + "][" + WORD_CHARS_PLUS_DIGITS + "\\-_]*))(?=:|$|\\s|" + TAG_BOUNDARY_CHARS + ")", "ig");

function debugMessage(a) {
    LOG_DEBUG_MESSAGES && console.log(a)
}
$(document).ready(function () {
    detectAndSetUpEnvironment();
    debugMessage("Debug mode ON");
    MOST_RECENT_OPERATION_TRANSACTION_ID = INITIAL_MOST_RECENT_OPERATION_TRANSACTION_ID;
    POLLING_INTERVAL_IN_MS = INITIAL_POLLING_INTERVAL_IN_MS;
    debugMessage("Initial polling interval: " + INITIAL_POLLING_INTERVAL_IN_MS + " ms");
    LOCAL_STORAGE_SUPPORTED && transferCookiesToLocalStorage();
    $.ajaxSetup({
        timeout: 12E5
    });
    createEditors();
    buildProjectIdToProjectMapAndAttachParentPointers();
    initializeExpandedProjects();
    addEvents();
    initializeCompleted();
    updateSaveStatus();
    $("#searchBox").val("");
    $.address.tracker(null);
    selectAndSearchUsingFragment();
    TIMEOUTS.serverPoll = setTimeout(pollServerForRemoteOperations, POLLING_INTERVAL_IN_MS);
    IS_MOBILE || setPageMargins();
    mpq.push(["register",
    {
        new_user: isNewUser()
    }]);
    mpq.push(["identify", $("body").attr("data-user")]);
    mpq.push(["track", "window-open",
    {
        reload: true
    }]);
    setInterval(function () {
        mpq.push(["track", "window-open",
        {
            reload: false
        }])
    }, 18E5);
    showSiteMessageIfNeeded()
});

function detectAndSetUpEnvironment() {
    if ($("body").hasClass("normal_usage")) NORMAL_USAGE = true;
    if ($("body").hasClass("mobile")) {
        NO_ANIMATIONS = IS_MOBILE = true;
        if ($("body").hasClass("ios")) IS_IOS = true;
        else if ($("body").hasClass("android")) IS_ANDROID = true
    }
    if ($("body").hasClass("disable_editing")) DISABLE_EDITING = true;
    if ($("body").hasClass("mozilla")) IS_FIREFOX = true;
    if ($("body").hasClass("ie")) IS_IE = true;
    try {
        LOCAL_STORAGE_SUPPORTED = "localStorage" in window && window.localStorage !== null
    } catch (a) {
        LOCAL_STORAGE_SUPPORTED = false
    }
}
function transferCookiesToLocalStorage() {
    if (window.location.protocol === "https:") {
        var a = ["expanded", "completedMode"],
            b;
        for (b in a) {
            var c = a[b],
                d = $.cookie(c);
            if (d !== null) {
                $.cookie(c, null);
                localStorage.getItem(c) === null && writeLocalStorage(c, d)
            }
        }
    }
}

function createEditors() {
    function a() {
        if (IS_MOBILE) return $('<div class="editor"><textarea autocomplete="off" autocorrect="off"></textarea></div>').attr("id", "editor-" + $.generateUUID());
        return $('<div class="editor"><textarea></textarea></div>').attr("id", "editor-" + $.generateUUID())
    }
    var b = a();
    $("body").append(b);
    if (!IS_MOBILE) {
        b = a();
        $("body").append(b)
    }
}
function localStorageKey(a) {
    return SHARED_ROOT_PROJECTID === null ? a : a + "-" + SHARED_ROOT_PROJECTID
}

function writeLocalStorage(a, b) {
    try {
        localStorage.setItem(a, b)
    } catch (c) {}
}
function initializeCompleted() {
    var a = null;
    if (LOCAL_STORAGE_SUPPORTED) {
        a = localStorageKey("completedMode");
        a = localStorage.getItem(a)
    }
    a === null || a === "show" ? showCompleted("instant") : hideCompleted("instant")
}
function buildProjectIdToProjectMapAndAttachParentPointers() {
    PROJECTID_TO_PROJECT_MAP = {};
    for (var a in PROJECT_TREE) addToProjectIdToProjectMapAndAttachParentPointers(PROJECTID_TO_PROJECT_MAP, PROJECT_TREE[a], null)
}

function addToProjectIdToProjectMapAndAttachParentPointers(a, b, c) {
    var d = b.id;
    if (!("ch" in b)) b.ch = [];
    var e = b.ch;
    a[d] = b;
    b.pa = c;
    for (var f in e) addToProjectIdToProjectMapAndAttachParentPointers(a, e[f], b)
}

function constructProjectTreeFromSelectedProjectTreeObject(a, b) {
    if (b === undefined) b = true;
    var c = [];
    if (b) {
        var d = getChildrenOfProjectTreeObject(a),
            e;
        for (e in d) c.push(constructProjectTreeHtml(d[e]))
    }
    d = true;
    e = a;
    for (c = c; e != null;) {
        c = [constructProjectTreeHtml(e, c, d ? "selected" : "parent")];
        e = e.pa;
        d = false
    }
    d = $("#workflowy");
    d.removeClass("selected").removeClass("parent");
    a == null ? d.addClass("selected") : d.addClass("parent");
    c = constructChildren(c);
    d.overwriteProjectChildrenHtml(c)
}
jQuery.fn.overwriteProjectChildrenHtml = function (a) {
    var b = $(this);
    b.clearControlsUnderProject(true);
    b.children(".children").html(a)
};

function constructProjectTreeHtml(a, b, c) {
    if (b === undefined) b = null;
    if (c === undefined) c = "";
    var d = a.id,
        e = "nm" in a ? a.nm : "",
        f = "no" in a ? a.no : "",
        g = "cp" in a ? a.cp : false,
        i = "shared" in a,
        h = a.ch,
        n = false;
    if (h.length > 0) n = SEARCH_MODE ? isExpandedForSearch(a) : projectIdIsExpanded(d);
    var l = "",
        j = "",
        k = "";
    if (h.length == 0) l += "task ";
    if (g) l += "done ";
    if (f != "") l += "noted ";
    if (i) l += "shared ";
    if (n) l += "open ";
    l += c + " ";
    if (SEARCH_MODE) {
        c = getAdditionalClassesForSearch(a);
        l += c.project + " ";
        j += c.name + " ";
        k += c.note + " "
    }
    a = b != null ? b : n ? constructChildProjectTreeHtmls(a) : [];
    return '<div class="project ' + l + '" projectid="' + d + '"><div class="dropTarget"></div><div class="highlight"></div><div class="name ' + j + '"><a class="bullet" href="' + window.location.pathname + "#/" + d + '" title="Zoom in">&bull;<div></div></a><div class="content">' + textToHtml(e) + '</div><span class="parentArrow"><span class="arrow"> > </span><span class="other"></span></span></div><div class="notes ' + k + '"><div class="content">' + textToHtml(f) + '</div></div><div class="children">' + constructChildren(a) + "</div></div>"
}

function constructChildProjectTreeHtmls(a) {
    a = a.ch;
    var b = [],
        c;
    for (c in a) b.push(constructProjectTreeHtml(a[c]));
    return b
}
function constructChildren(a) {
    return a.join("") + '<div class="childrenEnd"></div>'
}
function constructEmptyProject(a) {
    a = constructProjectTreeHtml({
        id: a,
        ch: []
    });
    return $(a)
}
var ANIMATION_COUNTER = {
    contentToFocus: null,
    cursorPos: 0,
    animationType: null,
    animationsInProgress: 0,
    callbacks: [],
    increment: function () {
        if (this.animationsInProgress == 0) {
            blurFocusedTextarea();
            $(".editor").css("visibility", "hidden")
        }
        this.animationsInProgress++
    },
    decrement: function () {
        this.animationsInProgress--;
        this.animationsInProgress == 0 && animationsComplete();
        ANIMATION_COUNTER.animationsInProgress < 0 && alert("Less than zero animations!!!")
    }
};

function animationsComplete() {
    $.each(ANIMATION_COUNTER.callbacks, function (a, b) {
        b()
    });
    ANIMATION_COUNTER.callbacks = [];
    setTimeout(function () {
        $(".editor").css("visibility", "visible");
        styleAllEditAreas();
        IS_MOBILE || (ANIMATION_COUNTER.contentToFocus != null ? $(ANIMATION_COUNTER.contentToFocus).focusContent(ANIMATION_COUNTER.cursorPos) : $(".editor.lastEdited").children("textarea").focusEditorTextArea());
        recordAction({
            type: "interaction",
            data: {
                type: ANIMATION_COUNTER.animationType
            }
        });
        ANIMATION_COUNTER.animationType = null;
        ANIMATION_COUNTER.contentToFocus = null;
        ANIMATION_COUNTER.cursorPos = 0
    }, 1)
}
jQuery.fn.incrementAnimationCounter = function () {
    $(this).each(function () {
        ANIMATION_COUNTER.increment()
    });
    $(this).length == 0 && ANIMATION_COUNTER.animationsInProgress == 0 && animationsComplete();
    return this
};

function getAnimationSpeed(a) {
    if (NO_ANIMATIONS) return "instant";
    if (a === undefined) return "animate";
    return a
}

function selectAndSearchUsingFragment() {
    var a = $.address.pathNames(),
        b = $.address.parameter("q"),
        c = undefined;
    if (a.length > 0) c = getProjectTreeObjectByProjectId(a[0]);
    if (c === undefined) c = null;
    selectProjectTreeObjectInstantly(c);
    if (b !== undefined) {
        b = b.replace(/\+/g, " ");
        setSearchBoxAndSearch(b)
    } else {
        SEARCH_MODE && cancelSearch();
        if (!IS_MOBILE) {
            a = $(".selected");
            b = a.getVisibleChildren();
            (b.length > 0 ? b.first() : a).getName().moveCursorToBeginning()
        }
        $(window).scrollTop(0)
    }
    styleAllEditAreas()
}

function pollServerForRemoteOperations() {
    debugMessage("pollServerForRemoteOperations called");
    delete TIMEOUTS.serverPoll;
    if (IN_FLIGHT_OPERATION_QUEUE.length > 0 || POLL_IN_PROGRESS) alert("BAD: pushPendingOperationsToServer called with non-empty IN_FLIGHT_OPERATION_QUEUE or POLL_IN_PROGRESS");
    else {
        POLL_IN_PROGRESS = true;
        IN_FLIGHT_EXPANDED_PROJECTS_DELTA = PENDING_EXPANDED_PROJECTS_DELTA;
        PENDING_EXPANDED_PROJECTS_DELTA = {};
        var a = {
            client_id: CLIENT_ID,
            client_version: CLIENT_VERSION,
            most_recent_operation_transaction_id: MOST_RECENT_OPERATION_TRANSACTION_ID
        };
        if (!objectIsEmpty(IN_FLIGHT_EXPANDED_PROJECTS_DELTA)) a.project_expansions_delta = $.toJSON(IN_FLIGHT_EXPANDED_PROJECTS_DELTA);
        if (SHARED_ROOT_PROJECTID !== null) a.shared_projectid = SHARED_ROOT_PROJECTID;
        $.ajax({
            url: "/poll_remote_operations",
            timeout: 3E4,
            data: a,
            dataType: "json",
            type: "POST",
            success: function (b) {
                if (b == null) reschedulePollOnError();
                else if ("logged_out" in b && b.logged_out) showLoginPopup();
                else {
                    debugMessage("Poll succeeded");
                    POLL_IN_PROGRESS = false;
                    var c = null,
                        d = null;
                    if (!("new_most_recent_operation_transaction_id" in b) || !("new_polling_interval_in_ms" in b) || !("concurrent_remote_operation_transactions" in b) && !("refreshed_project_tree" in b)) showMessage("We're sorry, the server returned an unexpected response. Please <a href='#' class='refresh'>reload the page</a> and try again.", true);
                    else {
                        debugMessage("Polling interval from server: " + b.new_polling_interval_in_ms + " ms");
                        MOST_RECENT_OPERATION_TRANSACTION_ID = b.new_most_recent_operation_transaction_id;
                        POLLING_INTERVAL_IN_MS = b.new_polling_interval_in_ms;
                        if ("concurrent_remote_operation_transactions" in b) c = b.concurrent_remote_operation_transactions;
                        if ("refreshed_project_tree" in b) d = b.refreshed_project_tree
                    }
                    "error_encountered_in_remote_operations" in b && b.error_encountered_in_remote_operations && debugMessage("Server returned error_encountered_in_remote_operations");
                    "alert_message" in b && alert(b.alert_message);
                    "dropdown_message" in b && showMessage(b.dropdown_message, true);
                    applyConcurrentRemoteOperationTransactionsOrRefreshProjectTree(c, d);
                    IN_FLIGHT_EXPANDED_PROJECTS_DELTA = {};
                    scheduleNextPushOrPoll()
                }
            },
            error: function () {
                reschedulePollOnError()
            }
        })
    }
}
function applyLocalOperationAndAddToPendingQueue(a, b, c) {
    if (c === undefined) c = null;
    a = {
        type: a,
        data: b,
        undo_data: c
    };
    debugMessage("Applying local operation:");
    debugMessage(a);
    applyOperations([a]);
    PENDING_OPERATION_QUEUE.push(a);
    updateSaveStatus();
    scheduleNextPushOrPoll();
    recordAction({
        type: "operation",
        data: a
    })
}

function updateSaveStatus() {
    var a;
    a = IN_FLIGHT_OPERATION_QUEUE.length > 0 ? "saving" : PENDING_OPERATION_QUEUE.length > 0 ? "saveNow" : "saved";
    $("body").removeClass("saving").removeClass("saveNow").removeClass("saved").addClass(a)
}
function scheduleNextPushOrPoll(a, b) {
    IN_FLIGHT_OPERATION_QUEUE.length > 0 || POLL_IN_PROGRESS || (PENDING_OPERATION_QUEUE.length > 0 ? scheduleNextPush(a) : scheduleNextPoll(b))
}

function scheduleNextPush(a) {
    if (a === undefined) a = false;
    var b = "serverPush" in TIMEOUTS;
    if (!(b && !a)) {
        if (b) {
            clearTimeout(TIMEOUTS.serverPush);
            delete TIMEOUTS.serverPush
        }
        if ("serverPoll" in TIMEOUTS) {
            clearTimeout(TIMEOUTS.serverPoll);
            delete TIMEOUTS.serverPoll
        }
        TIMEOUTS.serverPush = setTimeout(pushPendingOperationsToServer, a ? 1 : PENDING_OPERATION_PUSH_DELAY)
    }
}

function scheduleNextPoll(a) {
    if (a === undefined) a = false;
    var b = "serverPoll" in TIMEOUTS;
    if (!("serverPush" in TIMEOUTS || b)) if (WINDOW_FOCUSED) {
        a = a ? 1 : POLLING_INTERVAL_IN_MS;
        TIMEOUTS.serverPoll = setTimeout(pollServerForRemoteOperations, a);
        debugMessage("Scheduled poll to happen in " + a + " ms.")
    }
}
function operationQueueContainsOperationType(a, b) {
    for (opIndex in a) if (a[opIndex].type == b) return true;
    return false
}

function pushPendingOperationsToServer() {
    debugMessage("pushPendingOperationsToServer called");
    delete TIMEOUTS.serverPush;
    if (IN_FLIGHT_OPERATION_QUEUE.length > 0) alert("BAD: pushPendingOperationsToServer called with non-empty IN_FLIGHT_OPERATION_QUEUE");
    else {
        IN_FLIGHT_OPERATION_QUEUE = PENDING_OPERATION_QUEUE;
        PENDING_OPERATION_QUEUE = [];
        updateSaveStatus();
        IN_FLIGHT_EXPANDED_PROJECTS_DELTA = PENDING_EXPANDED_PROJECTS_DELTA;
        PENDING_EXPANDED_PROJECTS_DELTA = {};
        var a = function () {
                debugMessage("pushPendingOperationsToServer failed. Retrying...");
                TRANSMISSION_FAILURES_SINCE_LAST_SUCCESS++;
                reschedulePushOnError();
                TRANSMISSION_FAILURES_SINCE_LAST_SUCCESS == 2 && alert("Warning: We are unable to save your changes right now.\n\nYour internet connection may be down, or we may be unable to contact the server. Your changes will be saved when we can reconnect.");
                TRANSMISSION_FAILURES_SINCE_LAST_SUCCESS >= 2 && showMessage("<strong>Warning: We are unable to save your changes right now.</strong><br>Your changes will be saved when we can reconnect to the server.", true, "connectionErrorMessage")
            },
            b = {
                client_id: CLIENT_ID,
                client_version: CLIENT_VERSION,
                most_recent_operation_transaction_id: MOST_RECENT_OPERATION_TRANSACTION_ID,
                operations: $.toJSON(IN_FLIGHT_OPERATION_QUEUE)
            };
        if (!objectIsEmpty(IN_FLIGHT_EXPANDED_PROJECTS_DELTA)) b.project_expansions_delta = $.toJSON(IN_FLIGHT_EXPANDED_PROJECTS_DELTA);
        if (SHARED_ROOT_PROJECTID !== null) b.shared_projectid = SHARED_ROOT_PROJECTID;
        $.ajax({
            url: "/run_operations",
            data: b,
            dataType: "json",
            type: "POST",
            success: function (c) {
                if (c == null) a();
                else {
                    debugMessage("pushPendingOperationsToServer succeeded!");
                    TRANSMISSION_FAILURES_SINCE_LAST_SUCCESS = 0;
                    $("#message.connectionErrorMessage:visible").length > 0 && hideMessage();
                    if ("logged_out" in c && c.logged_out) showLoginPopup();
                    else {
                        var d = false;
                        if ("error_encountered" in c && c.error_encountered) {
                            showMessage("We're sorry, the server encountered an error while saving your data. Please <a href='#' class='refresh'>reload the page</a> and try again.", true);
                            d = true
                        }
                        var e = null,
                            f = null;
                        if (!("new_most_recent_operation_transaction_id" in c) || !("new_polling_interval_in_ms" in c) || !("concurrent_remote_operation_transactions" in c) && !("refreshed_project_tree" in c)) showMessage("We're sorry, the server returned an unexpected response. Please <a href='#' class='refresh'>reload the page</a> and try again.", true);
                        else {
                            debugMessage("Polling interval from server: " + c.new_polling_interval_in_ms + " ms");
                            MOST_RECENT_OPERATION_TRANSACTION_ID = c.new_most_recent_operation_transaction_id;
                            POLLING_INTERVAL_IN_MS = c.new_polling_interval_in_ms;
                            if ("concurrent_remote_operation_transactions" in c) e = c.concurrent_remote_operation_transactions;
                            if ("refreshed_project_tree" in c) f = c.refreshed_project_tree
                        }
                        "error_encountered_in_remote_operations" in c && c.error_encountered_in_remote_operations && debugMessage("Server returned error_encountered_in_remote_operations");
                        "alert_message" in c && alert(c.alert_message);
                        "dropdown_message" in c && showMessage(c.dropdown_message, true);
                        operationQueueContainsOperationType(IN_FLIGHT_OPERATION_QUEUE, "undelete") && showMessage("Item restored.");
                        notifyShareOrUnshareCompleteIfNeeded(IN_FLIGHT_OPERATION_QUEUE, d);
                        d || applyConcurrentRemoteOperationTransactionsOrRefreshProjectTree(e, f);
                        IN_FLIGHT_OPERATION_QUEUE = [];
                        IN_FLIGHT_EXPANDED_PROJECTS_DELTA = {};
                        updateSaveStatus();
                        scheduleNextPushOrPoll()
                    }
                }
            },
            error: a
        })
    }
}

function reschedulePushOnError() {
    PENDING_OPERATION_QUEUE = IN_FLIGHT_OPERATION_QUEUE.concat(PENDING_OPERATION_QUEUE);
    IN_FLIGHT_OPERATION_QUEUE = [];
    updateSaveStatus();
    PENDING_EXPANDED_PROJECTS_DELTA = overlayExpandedProjectsDelta(IN_FLIGHT_EXPANDED_PROJECTS_DELTA, PENDING_EXPANDED_PROJECTS_DELTA);
    IN_FLIGHT_EXPANDED_PROJECTS_DELTA = {};
    scheduleNextPushOrPoll()
}

function reschedulePollOnError() {
    POLL_IN_PROGRESS = false;
    PENDING_EXPANDED_PROJECTS_DELTA = overlayExpandedProjectsDelta(IN_FLIGHT_EXPANDED_PROJECTS_DELTA, PENDING_EXPANDED_PROJECTS_DELTA);
    IN_FLIGHT_EXPANDED_PROJECTS_DELTA = {};
    scheduleNextPushOrPoll()
}
function overlayExpandedProjectsDelta(a, b) {
    for (var c in b) a[c] = b[c];
    return a
}

function applyConcurrentRemoteOperationTransactionsOrRefreshProjectTree(a, b) {
    if (a === undefined) a = null;
    if (b === undefined) b = null;
    if (!(b === null && (a === null || a.length === 0))) {
        var c = saveClientViewState();
        $(".editor").hideEditor();
        var d, e = false;
        if (b !== null) {
            d = loadRefreshedProjectTree(b);
            d = d.errorEncountered;
            e = true
        } else {
            d = applyConcurrentRemoteOperationTransactions(a);
            d = d.errorEncountered
        }
        restoreClientViewState(c, e);
        d && showMessage("An unexpected error occurred when applying the changes made in another session for this account. Please <a href='#' class='refresh'>reload the page</a> before continuing.", true)
    }
}

function saveClientViewState() {
    var a = $(".selected").attr("projectid"),
        b = [];
    $(".editor").each(function () {
        var c = $(this),
            d = c.getContentTarget();
        if (d != null) {
            var e = {
                editor: c
            };
            e.projectid = c.getProject().attr("projectid");
            if (c.isName()) e.contentType = "name";
            else if (c.isNote()) e.contentType = "note";
            if (d.hasClass("editing")) {
                e.editing = true;
                e.caret = c.children("textarea").getCaret();
                if (c.editorHasChangedContent()) e.changedContent = c.children("textarea").val()
            } else e.editing = false;
            b = b.concat(e)
        }
    });
    return {
        selectedProjectId: a,
        editorInfoList: b
    }
}

function restoreClientViewState(a, b) {
    if (b === undefined) b = false;
    var c = a.editorInfoList,
        d = getProjectTreeObjectByProjectId(a.selectedProjectId);
    if (d === undefined) d = null;
    selectProjectTreeObjectInstantly(d, b);
    for (var e in c) {
        d = c[e];
        var f = getProjectByProjectId(d.projectid);
        if (f.length == 1 && f.is(":visible")) {
            var g = null;
            if (d.contentType == "name") g = f.getName();
            else if (d.contentType == "note") g = f.getNotes();
            if (g != null) {
                f = g.placeEditArea(d.editor);
                if (f !== null && d.editing) {
                    f.setCaret(d.caret.start, d.caret.end);
                    if ("changedContent" in d) {
                        f.val(d.changedContent);
                        f.parent(".editor").styleEditArea();
                        f.setCaret(d.caret.start, d.caret.end)
                    }
                }
            }
        }
    }
}

function loadRefreshedProjectTree(a) {
    debugMessage("loadRefreshedProjectTree called");
    var b;
    try {
        b = $.evalJSON(a)
    } catch (c) {
        debugMessage(c);
        return {
            errorEncountered: true
        }
    }
    debugMessage("Installing refreshed_project_tree");
    PROJECT_TREE = b;
    buildProjectIdToProjectMapAndAttachParentPointers();
    SEARCH_MODE && markMatchingProjects(null, SEARCH_TOKEN_REGEXP_LIST);
    $("#workflowy").overwriteProjectChildrenHtml("");
    debugMessage("applying pending");
    applyOperations(PENDING_OPERATION_QUEUE, false);
    return {
        errorEncountered: false
    }
}

function applyConcurrentRemoteOperationTransactions(a) {
    debugMessage("applyConcurrentRemoteOperationTransactions called");
    var b = [];
    try {
        for (operationTransactionIndex in a) {
            var c = a[operationTransactionIndex];
            debugMessage("remote operation: " + c);
            var d = $.evalJSON(c);
            b = b.concat(d)
        }
    } catch (e) {
        debugMessage(e);
        return {
            errorEncountered: true
        }
    }
    debugMessage("num remote operations: " + b.length);
    try {
        debugMessage("undoing pending");
        undoOperations(PENDING_OPERATION_QUEUE);
        debugMessage("undoing in-flight");
        undoOperations(IN_FLIGHT_OPERATION_QUEUE);
        debugMessage("applying remote");
        applyOperations(b)
    } catch (f) {
        debugMessage(f);
        return {
            errorEncountered: true
        }
    }
    debugMessage("applying in-flight");
    applyOperations(IN_FLIGHT_OPERATION_QUEUE, false);
    debugMessage("applying pending");
    applyOperations(PENDING_OPERATION_QUEUE, false);
    return {
        errorEncountered: false
    }
}

function applyOperations(a, b) {
    if (b === undefined) b = true;
    for (operationIndex in a) {
        var c = a[operationIndex];
        try {
            var d = getFieldOrThrowException(c, "type"),
                e = getFieldOrThrowException(c, "data");
            if (!("server_data" in c && "was_noop" in c.server_data && c.server_data.was_noop)) {
                debugMessage("apply: " + d);
                switch (d) {
                case "edit":
                    applyEditOperation(e);
                    break;
                case "create":
                    applyCreateOperation(e);
                    break;
                case "complete":
                    applyCompleteOperation(e);
                    break;
                case "uncomplete":
                    applyUncompleteOperation(e);
                    break;
                case "delete":
                    applyDeleteOperation(e);
                    break;
                case "undelete":
                    applyUndeleteOperation(e);
                    break;
                case "move":
                    applyMoveOperation(e);
                    break;
                case "share":
                    applyShareOperation(e);
                    break;
                case "unshare":
                    applyUnshareOperation(e);
                    break;
                default:
                    throw Error("Unrecognized operation type: '" + d + "'");
                }
            }
        } catch (f) {
            if (b) throw f;
        }
    }
}

function applyEditOperation(a) {
    var b = getFieldOrThrowException(a, "projectid"),
        c = "name" in a ? a.name : null;
    a = "description" in a ? a.description : null;
    var d = getProjectTreeObjectByProjectIdOrThrowException(b);
    if (c != null) d.nm = c;
    if (a != null) d.no = a;
    b = getProjectByProjectId(b);
    if (b.length == 1) {
        if (c != null) {
            d = b.getName().children(".content");
            d.hasClass("editing") || d.setContentHtml(textToHtml(c))
        }
        if (a != null) {
            c = b.getNotes().children(".content");
            if (!c.hasClass("editing")) {
                c.setContentHtml(textToHtml(a));
                a.length > 0 ? b.addClass("noted") : b.removeClass("noted")
            }
        }
    }
}

function applyCreateOperation(a) {
    var b = getFieldOrThrowException(a, "projectid"),
        c = getFieldOrThrowException(a, "parentid");
    a = getFieldOrThrowException(a, "priority");
    if (getProjectTreeObjectByProjectId(b) !== undefined) throw Error("Trying to create project with already-existing projectid " + b);
    c = getProjectTreeObjectByProjectIdOrThrowException(c);
    var d = getChildrenOfProjectTreeObject(c),
        e = {
            id: b
        };
    d.splice(a >= d.length ? d.length : a, 0, e);
    addToProjectIdToProjectMapAndAttachParentPointers(PROJECTID_TO_PROJECT_MAP, e, c);
    addProjectToDOM(c, a, function () {
        return constructEmptyProject(b)
    })
}
function addProjectToDOM(a, b, c) {
    a = getProjectByProjectTreeObject(a);
    if (a.length == 1) {
        if (!a.is("parent") && (a.is(".selected") || a.is(".open"))) {
            var d = a.getChildren();
            b = b >= d.length ? a.children(".children").children(".childrenEnd") : d.eq(b);
            c = c();
            b.before(c)
        }
        a.removeClass("task");
        a.refreshExpanded()
    }
}

function applyCompleteOperation(a) {
    a = getFieldOrThrowException(a, "projectid");
    getProjectTreeObjectByProjectIdOrThrowException(a).cp = true;
    a = getProjectByProjectId(a);
    if (a.length == 1) {
        a.addClass("done");
        a = a.children(".name").children(".content").getEditor();
        a != false && a.addClass("doneEditor")
    }
}

function applyUncompleteOperation(a) {
    a = getFieldOrThrowException(a, "projectid");
    getProjectTreeObjectByProjectIdOrThrowException(a).cp = false;
    a = getProjectByProjectId(a);
    if (a.length == 1) {
        a.removeClass("done");
        a = a.children(".name").children(".content").getEditor();
        a != false && a.removeClass("doneEditor")
    }
}

function applyDeleteOperation(a, b) {
    if (b === undefined) b = false;
    var c = getFieldOrThrowException(a, "projectid"),
        d = getProjectTreeObjectByProjectIdOrThrowException(c),
        e = d.pa,
        f = getChildrenOfProjectTreeObject(e),
        g = getPriorityOfProjectTreeObject(f, d);
    f.splice(g, 1);
    delete PROJECTID_TO_PROJECT_MAP[c];
    b || (DELETED_PROJECTID_TO_PROJECT_MAP[c] = d);
    removeProjectByProjectIdFromDOM(c, e)
}

function removeProjectByProjectIdFromDOM(a, b) {
    var c = getProjectByProjectId(a);
    if (c.length == 1) {
        c.detachEditorsForProject();
        c.clearControlsUnderProject();
        c.remove()
    }
    if (getChildrenOfProjectTreeObject(b).length == 0) {
        c = getProjectByProjectTreeObject(b);
        c.length == 1 && c.addClass("task").hideChildren("instant")
    }
}
function applyUndeleteOperation() {}

function applyMoveOperation(a) {
    var b = getFieldOrThrowException(a, "projectid"),
        c = getFieldOrThrowException(a, "parentid");
    a = getFieldOrThrowException(a, "priority");
    var d = getProjectTreeObjectByProjectIdOrThrowException(b);
    c = getProjectTreeObjectByProjectIdOrThrowException(c);
    var e = d.pa,
        f = getChildrenOfProjectTreeObject(e),
        g = getPriorityOfProjectTreeObject(f, d);
    f.splice(g, 1);
    removeProjectByProjectIdFromDOM(b, e);
    insertProjectIntoProjectTreeAndDOM(d, c, a)
}

function insertProjectIntoProjectTreeAndDOM(a, b, c) {
    var d = a.id,
        e = getChildrenOfProjectTreeObject(b);
    e.splice(c >= e.length ? e.length : c, 0, a);
    a.pa = b;
    PROJECTID_TO_PROJECT_MAP[d] = a;
    addProjectToDOM(b, c, function () {
        return $(constructProjectTreeHtml(a))
    })
}

function applyShareOperation(a) {
    var b = getFieldOrThrowException(a, "projectid");
    a = getFieldOrThrowException(a, "write_permission");
    getProjectTreeObjectByProjectIdOrThrowException(b).shared = {
        write_permission: a
    };
    b = getProjectByProjectId(b);
    b.length == 1 && b.addClass("shared")
}
function applyUnshareOperation(a) {
    a = getFieldOrThrowException(a, "projectid");
    delete getProjectTreeObjectByProjectIdOrThrowException(a).shared;
    a = getProjectByProjectId(a);
    a.length == 1 && a.removeClass("shared")
}

function undoOperations(a) {
    for (var b = a.length - 1; b >= 0; b--) {
        var c = a[b];
        try {
            var d = getFieldOrThrowException(c, "type"),
                e = getFieldOrThrowException(c, "data"),
                f = getFieldOrThrowException(c, "undo_data");
            if (!("server_data" in c && "was_noop" in c.server_data && c.server_data.was_noop)) {
                debugMessage("undo: " + d);
                switch (d) {
                case "edit":
                    undoEditOperation(e, f);
                    break;
                case "create":
                    undoCreateOperation(e, f);
                    break;
                case "complete":
                    undoCompleteOperation(e, f);
                    break;
                case "uncomplete":
                    undoUncompleteOperation(e, f);
                    break;
                case "delete":
                    undoDeleteOperation(e, f);
                    break;
                case "undelete":
                    undoUndeleteOperation(e, f);
                    break;
                case "move":
                    undoMoveOperation(e, f);
                    break;
                case "share":
                case "unshare":
                    undoShareOrUnshareOperation(e, f);
                    break;
                default:
                    throw Error("Unrecognized operation type: '" + d + "'");
                }
            }
        } catch (g) {
            throw g;
        }
    }
}
function undoEditOperation() {}
function undoCreateOperation(a) {
    a = {
        projectid: getFieldOrThrowException(a, "projectid")
    };
    applyDeleteOperation(a, true)
}

function undoCompleteOperation(a) {
    a = {
        projectid: getFieldOrThrowException(a, "projectid")
    };
    applyUncompleteOperation(a)
}
function undoUncompleteOperation(a) {
    a = {
        projectid: getFieldOrThrowException(a, "projectid")
    };
    applyCompleteOperation(a)
}

function undoDeleteOperation(a, b) {
    var c = getFieldOrThrowException(a, "projectid"),
        d = getFieldOrThrowException(b, "parentid"),
        e = getFieldOrThrowException(b, "priority");
    d = getProjectTreeObjectByProjectIdOrThrowException(d);
    if (!(c in DELETED_PROJECTID_TO_PROJECT_MAP)) throw Error("No deleted project with projectid " + c);
    var f = DELETED_PROJECTID_TO_PROJECT_MAP[c];
    delete DELETED_PROJECTID_TO_PROJECT_MAP[c];
    insertProjectIntoProjectTreeAndDOM(f, d, e)
}
function undoUndeleteOperation() {}

function undoMoveOperation(a, b) {
    var c = getFieldOrThrowException(a, "projectid"),
        d = getFieldOrThrowException(b, "previous_parentid"),
        e = getFieldOrThrowException(b, "previous_priority");
    applyMoveOperation({
        projectid: c,
        parentid: d,
        priority: e
    })
}
function undoShareOrUnshareOperation(a, b) {
    var c = getFieldOrThrowException(a, "projectid"),
        d = getFieldOrThrowException(b, "previous_shared_info");
    d !== null ? applyShareOperation({
        projectid: c,
        write_permission: d.write_permission
    }) : applyUnshareOperation({
        projectid: c
    })
}

function getFieldOrThrowException(a, b) {
    if (!(b in a)) throw Error("Expected field '" + b + "' not found.");
    return a[b]
}
function getProjectTreeObjectByProjectId(a) {
    return a == "None" ? null : PROJECTID_TO_PROJECT_MAP[a]
}
function getProjectByProjectTreeObject(a) {
    return a == null ? $("#workflowy") : getProjectByProjectId(a.id)
}
function getProjectTreeObjectByProjectIdOrThrowException(a) {
    var b = getProjectTreeObjectByProjectId(a);
    if (b === undefined) throw Error("No project tree object with projectid " + a);
    return b
}

function getProjectByProjectId(a) {
    return $("#visible .project[projectid=" + a + "]")
}
function getProjectByProjectIdOrThrowException(a) {
    var b = getProjectByProjectId(a);
    if (b.length != 1) throw Error("No project with projectid " + a);
    return b
}

function searchProjectTree(a) {
    a = a.toLowerCase().split(/\s+/);
    for (var b = [], c = 0; c < a.length; c++) {
        var d = a[c];
        if (d.length != 0) {
            var e = d.replace(/[-\[\]{}()*+?.,\\^$|#]/g, "\\$&");
            d = "(?=$|[^" + WORD_CHARS_PLUS_DIGITS + "])";
            e = "(^|[^" + WORD_CHARS_PLUS_DIGITS + "])(" + e + ")";
            if (c != a.length - 1) e += d;
            b.push(RegExp(e, "ig"))
        }
    }
    if (b.length > 0) {
        clearSearchResultInfoFromProjectTree();
        markMatchingProjects(null, b);
        SEARCH_MODE = true;
        SEARCH_TOKEN_REGEXP_LIST = b;
        $("body").addClass("searching")
    } else exitSearchMode();
    constructProjectTreeFromSelectedProjectTreeObject($(".selected").getProjectTreeObjectForProject());
    $(".editor").hideEditor(true)
}
function clearSearchResultInfoFromProjectTree() {
    for (var a in PROJECTID_TO_PROJECT_MAP) delete PROJECTID_TO_PROJECT_MAP[a].searchResult
}
function exitSearchMode() {
    clearSearchResultInfoFromProjectTree();
    SEARCH_MODE = false;
    SEARCH_TOKEN_REGEXP_LIST = [];
    $("body").removeClass("searching");
    if (!$(document.activeElement).is("#searchBox")) {
        $("#searchBox").val("");
        $("#searchForm").removeClass("clearPrompt");
        $.address.parameter("q", null)
    }
}

function markMatchingProjects(a, b, c) {
    if (c === undefined) c = false;
    var d = a !== null && "cp" in a ? a.cp : false;
    d |= c;
    var e = c = false,
        f = getChildrenOfProjectTreeObject(a),
        g;
    for (g in f) {
        var i = markMatchingProjects(f[g], b, d);
        c |= i.uncompletedDescendantMatches;
        e |= i.completedDescendantMatches
    }
    g = false;
    if (a !== null) {
        f = "nm" in a && stringMatchesSearchRegExpList(a.nm, b);
        b = "no" in a && stringMatchesSearchRegExpList(a.no, b);
        g = f || b;
        a.searchResult = {
            matches: g,
            uncompletedDescendantMatches: c,
            completedDescendantMatches: e,
            nameMatches: f,
            noteMatches: b
        }
    }
    return {
        uncompletedDescendantMatches: !d && g || c,
        completedDescendantMatches: d && g || e
    }
}
function stringMatchesSearchRegExpList(a, b) {
    for (var c in b) if (a.match(b[c]) == null) return false;
    return true
}
function isExpandedForSearch(a) {
    if ("searchResult" in a) {
        a = a.searchResult;
        return a.uncompletedDescendantMatches || a.completedDescendantMatches
    } else return false
}

function getAdditionalClassesForSearch(a) {
    var b = {
        project: "",
        name: "",
        note: ""
    };
    if ("searchResult" in a) {
        a = a.searchResult;
        if (a.matches) b.project += "matches ";
        if (a.uncompletedDescendantMatches) b.project += "uncompletedDescendantMatches ";
        if (a.completedDescendantMatches) b.project += "completedDescendantMatches ";
        if (a.nameMatches) b.name += "matches ";
        if (a.noteMatches) b.note += "matches "
    }
    return b
}
jQuery.fn.getProjectTreeObjectForProject = function () {
    var a = $(this);
    return getProjectTreeObjectByProjectId(a.attr("projectid"))
};

function getChildrenOfProjectTreeObject(a) {
    return a == null ? PROJECT_TREE : a.ch
}
jQuery.fn.getChildren = function () {
    return $(this).children(".children").children(".project")
};
jQuery.fn.getVisibleChildren = function (a) {
    return $(this).getChildren().filterVisibleProjects(a)
};
jQuery.fn.filterVisibleProjects = function (a) {
    if (a === undefined) a = shouldShowCompletedProjects();
    var b = $(this);
    a || (b = b.not(".done"));
    if (SEARCH_MODE) b = a ? b.filter(".matches, .uncompletedDescendantMatches, .completedDescendantMatches") : b.filter(".matches, .uncompletedDescendantMatches");
    return b
};

function getVisibleChildrenOfProjectTreeObject(a, b, c) {
    if (b === undefined) ignoreSearchMOde = false;
    if (c === undefined) c = shouldShowCompletedProjects();
    a = getChildrenOfProjectTreeObject(a);
    var d = [],
        e;
    for (e in a) {
        var f = a[e],
            g = "cp" in f && f.cp;
        if ((c || !g) && (b || !SEARCH_MODE || f.searchResult.matches || f.searchResult.uncompletedDescendantMatches || c && f.searchResult.completedDescendantMatches)) d.push(f)
    }
    return d
}
jQuery.fn.selectIt = function (a, b) {
    if (a === undefined) a = "first_child";
    b = getAnimationSpeed(b);
    ANIMATION_COUNTER.animationType = "zoom";
    var c = $(this),
        d = $(this).attr("projectid"),
        e = c.getProjectTreeObjectForProject();
    hideControls();
    if (!c.is(".selected")) {
        var f = $(document.activeElement).parent(".editor");
        if (f.length == 1) var g = f.getProject().attr("projectid"),
            i = f.find("textarea").getCaret().start;
        else g = null;
        var h = null;
        if (a == "first_child") {
            f = getVisibleChildrenOfProjectTreeObject(e);
            if (f.length > 0) h = f[0].id;
            else if (e != null) h = e.id
        } else if (a == "last_selected") h = $(".selected").attr("projectid");
        var n = $(".selected");
        f = function () {
            var p = c.getName();
            p.removeAttr("style");
            p.children(".content").removeAttr("style");
            n.getName().children(".content").removeAttr("style");
            $(".add.lastChild").removeAttr("style");
            $(".nameAnimated").remove();
            if (SEARCH_MODE) {
                $.address.autoUpdate(false);
                exitSearchMode();
                $.address.autoUpdate(true)
            }
            setTimeout(function () {
                setTitleAndFragmentPathForProjectId(d)
            }, 1);
            p = getProjectTreeObjectByProjectId(d);
            constructProjectTreeFromSelectedProjectTreeObject(p);
            var s = $(".selected");
            s.addClass("highlighted");
            setTimeout(function () {
                s.removeClass("highlighted")
            }, 100);
            if (IS_MOBILE) $(window).scrollTop(0);
            else if (h != null) {
                p = g != null ? getProjectByProjectId(g) : null;
                var q = getProjectByProjectId(h);
                if (b == "animate") ANIMATION_COUNTER.contentToFocus = q.getName().children(".content");
                if (p != null && q.filter(p).length > 0) if (b == "animate") ANIMATION_COUNTER.cursorPos = i;
                else q.children(".name").focusContent(i);
                else b != "animate" && q.children(".name").moveCursorToBeginning();
                a != "last_selected" && $(window).scrollTop(0)
            }
        };
        if (b == "animate") {
            ANIMATION_COUNTER.callbacks.push(f);
            f = [{
                project: c
            }, {
                project: n
            }];
            var l = {
                parent: {
                    fontSize: "18px",
                    lineHeight: "18px"
                },
                selected: {
                    fontSize: "36px",
                    lineHeight: "40px"
                },
                descendant: {
                    fontSize: "18px",
                    lineHeight: "21px"
                }
            },
                j = $("#workflowy"),
                k = j.getChildren(),
                m = j.attr("class");
            k.detach();
            constructProjectTreeFromSelectedProjectTreeObject(e, false);
            var r = function (p) {
                    var s = null,
                        q = null;
                    p = getProjectByProjectId(p);
                    if (p.length === 1) {
                        q = p.getName().children(".content");
                        if (q.is(":visible")) s = q.offset();
                        q = p.hasClass("parent") ? "parent" : p.hasClass("selected") ? "selected" : "descendant"
                    }
                    return {
                        offset: s,
                        projectClass: q
                    }
                },
                o;
            for (o in f) {
                e = f[o];
                var t = r(e.project.attr("projectid"));
                e.newOffset = t.offset;
                e.newProjectClass = t.projectClass
            }
            e = j.children(".children");
            e.html("");
            e.append(k);
            j.attr("class", m);
            for (o in f) {
                e = f[o];
                m = e.project.getName().children(".content");
                m.css("visibility", "hidden");
                j = $('<div class="nameAnimated">' + m.html() + "</div>");
                $("#visible").append(j);
                j.css({
                    position: "absolute",
                    zIndex: 100,
                    whiteSpace: m.css("whiteSpace"),
                    fontSize: m.css("fontSize"),
                    lineHeight: m.css("lineHeight")
                });
                if (e.newOffset === null) {
                    j.offset(m.offset());
                    j.incrementAnimationCounter().animate({
                        fontSize: "0px"
                    }, ANIMATION_SPEEDS.zoom, function () {
                        ANIMATION_COUNTER.decrement()
                    })
                } else {
                    j.offset(e.newOffset);
                    k = j.position();
                    m.is(":visible") ? j.offset(m.offset()) : j.css({
                        fontSize: "0px",
                        lineHeight: "0px"
                    });
                    e = l[e.newProjectClass];
                    e.top = k.top;
                    e.left = k.left;
                    j.incrementAnimationCounter().animate(e, ANIMATION_SPEEDS.zoom, function () {
                        ANIMATION_COUNTER.decrement()
                    })
                }
            }
            o = $(".selected").getVisibleChildren();
            o.slice(0, 10).incrementAnimationCounter().slideUp(ANIMATION_SPEEDS.zoom, function () {
                ANIMATION_COUNTER.decrement()
            });
            o.length > 10 && o.slice(10).hide();
            $(".add.lastChild").incrementAnimationCounter().slideUp(ANIMATION_SPEEDS.zoom, function () {
                ANIMATION_COUNTER.decrement()
            });
            $(".selected").children(".notes").incrementAnimationCounter().animate({
                opacity: "hide"
            }, ANIMATION_SPEEDS.zoom, function () {
                ANIMATION_COUNTER.decrement()
            });
            o = c.find(".parent");
            if (c.is(".parent")) o = o.add(c);
            o.children(".name").incrementAnimationCounter().animate({
                fontSize: "0px"
            }, ANIMATION_SPEEDS.zoom, function () {
                ANIMATION_COUNTER.decrement()
            });
            c.addClass("highlighted")
        } else {
            f();
            ANIMATION_COUNTER.increment();
            ANIMATION_COUNTER.decrement()
        }
    }
};

function selectProjectTreeObjectInstantly(a, b) {
    if (b === undefined) b = false;
    if (!b) {
        var c = $(".selected");
        if (c.length == 1 && (a == null ? c.is("#workflowy") : c.attr("projectid") == a.id)) {
            var d = getProjectTreeObjectAncestors(a);
            c = c.getParents();
            if (d.length == c.length) {
                var e = true,
                    f;
                for (f in d) {
                    var g = d[f],
                        i = c.eq(f);
                    if (g == null) {
                        if (!i.is("#workflowy")) {
                            e = false;
                            break
                        }
                    } else if (g.id != i.attr("projectid")) {
                        e = false;
                        break
                    }
                }
                if (e) return
            }
        }
    }
    debugMessage("Rebuilding DOM project tree in selectProjectTreeObjectInstantly because selected/ancestors changed.");
    constructProjectTreeFromSelectedProjectTreeObject(a);
    setTitleAndFragmentPathForProjectId($(".selected").attr("projectid"))
}
function setTitleAndFragmentPathForProjectId(a) {
    var b = getProjectTreeObjectByProjectId(a),
        c;
    c = b === null ? SHARED_ROOT_PROJECTID !== null ? $("#workflowy").getName().children(".content").getContentText() : "Organize your brain." : b.nm;
    if (c.length > 100) c = c.substring(0, 100) + "...";
    document.title = "WorkFlowy - " + c;
    $.address.path("/" + (b != null ? a : ""))
}

function truncateProjectIdForExpandedStorage(a) {
    return a.substring(0, 8)
}
function readLocalStorageExpandedProjects() {
    LOCALSTORAGE_EXPANDED_PROJECTS = {};
    var a = null;
    if (LOCAL_STORAGE_SUPPORTED) {
        a = localStorageKey("expanded");
        a = localStorage.getItem(a)
    }
    if (!(a === null || a.length == 0)) {
        a = a.split(",");
        for (var b in a) {
            var c = a[b].split(":"),
                d = truncateProjectIdForExpandedStorage(c[0]);
            LOCALSTORAGE_EXPANDED_PROJECTS[d] = {
                expanded: c.length === 1 || c[1] === "e"
            }
        }
    }
}

function writeLocalStorageExpandedProjects() {
    var a = [];
    for (truncatedProjectId in LOCALSTORAGE_EXPANDED_PROJECTS) a.push(truncatedProjectId + ":" + (LOCALSTORAGE_EXPANDED_PROJECTS[truncatedProjectId].expanded ? "e" : "c"));
    a = a.join(",");
    if (LOCAL_STORAGE_SUPPORTED) {
        var b = localStorageKey("expanded");
        writeLocalStorage(b, a)
    }
}

function initializeExpandedProjects() {
    for (var a = 0; a < SERVER_EXPANDED_PROJECTS_LIST.length; a++) {
        var b = SERVER_EXPANDED_PROJECTS_LIST[a];
        EXPANDED_PROJECTS[b] = {
            expanded: true
        }
    }
    readLocalStorageExpandedProjects();
    for (b in LOCALSTORAGE_EXPANDED_PROJECTS) EXPANDED_PROJECTS[b] = {
        expanded: LOCALSTORAGE_EXPANDED_PROJECTS[b].expanded
    }
}
function projectIdIsExpanded(a) {
    a = truncateProjectIdForExpandedStorage(a);
    return a in EXPANDED_PROJECTS ? EXPANDED_PROJECTS[a].expanded : false
}

function setExpandedForProjectIds(a, b) {
    if (!SEARCH_MODE) {
        for (var c in a) {
            var d = truncateProjectIdForExpandedStorage(a[c]);
            EXPANDED_PROJECTS[d] = {
                expanded: b
            };
            LOCALSTORAGE_EXPANDED_PROJECTS[d] = {
                expanded: b
            };
            PENDING_EXPANDED_PROJECTS_DELTA[d] = b
        }
        writeLocalStorageExpandedProjects()
    }
}

function addSubtreeExpansionsToPendingDelta(a) {
    var b = getChildrenOfProjectTreeObject(a);
    if (b.length !== 0) if (a !== null) {
        a = a.id;
        var c = projectIdIsExpanded(a);
        PENDING_EXPANDED_PROJECTS_DELTA[truncateProjectIdForExpandedStorage(a)] = c;
        for (var d in b) addSubtreeExpansionsToPendingDelta(b[d])
    }
}
jQuery.fn.setExpanded = function (a) {
    var b = [];
    this.each(function () {
        b.push($(this).attr("projectid"))
    });
    setExpandedForProjectIds(b, a);
    return this
};
jQuery.fn.refreshExpanded = function () {
    this.each(function () {
        var a = $(this);
        if (!a.is("#workflowy")) if (!a.is(".open")) {
            a = truncateProjectIdForExpandedStorage($(this).attr("projectid"));
            a in EXPANDED_PROJECTS && EXPANDED_PROJECTS[a].expanded && $(this).showChildren("instant")
        }
    });
    return this
};
jQuery.fn.showChildren = function (a) {
    a = getAnimationSpeed(a);
    this.each(function () {
        var b = $(this);
        b.addClass("open");
        if (!b.is(".parent, .selected")) {
            var c = b.getProjectTreeObjectForProject();
            c = constructChildProjectTreeHtmls(c);
            b.overwriteProjectChildrenHtml(constructChildren(c));
            a != "instant" && b.getVisibleChildren().hide().incrementAnimationCounter().slideDown(ANIMATION_SPEEDS.children, function () {
                $(this).removeAttr("style");
                ANIMATION_COUNTER.decrement()
            })
        }
    });
    return this
};
jQuery.fn.hideChildren = function (a) {
    a = getAnimationSpeed(a);
    var b = $(this);
    if (b.is(".parent, .selected")) b.removeClass("open");
    else {
        if (a == "instant") {
            b.removeClass("open");
            b.overwriteProjectChildrenHtml(constructChildren([]))
        } else b.children(".children").incrementAnimationCounter().slideUp(ANIMATION_SPEEDS.children, function () {
            $(this).removeAttr("style");
            b.removeClass("open");
            b.overwriteProjectChildrenHtml(constructChildren([]));
            ANIMATION_COUNTER.decrement()
        });
        return this
    }
};
jQuery.fn.getProject = function () {
    var a = $(this);
    if (a.is(".editor, textarea")) a = a.getContentTarget();
    return a.closest(".project")
};
jQuery.fn.getParent = function () {
    return $(this).parent(".children").parent(".project")
};
jQuery.fn.getParents = function () {
    for (var a = this, b = []; !a.is("#workflowy");) {
        a = a.getParent();
        b = b.concat(a.get())
    }
    return $(b)
};

function getProjectTreeObjectAncestors(a) {
    for (var b = []; a != null;) {
        a = a.pa;
        b.push(a)
    }
    return b
}
jQuery.fn.getPriority = function () {
    var a = $(this),
        b = a.getParent().getProjectTreeObjectForProject();
    b = getChildrenOfProjectTreeObject(b);
    if (a.is(".childrenEnd")) return b.length;
    else {
        a = a.getProjectTreeObjectForProject();
        return getPriorityOfProjectTreeObject(b, a)
    }
};

function getPriorityOfProjectTreeObject(a, b) {
    for (var c = 0; c < a.length; c++) if (a[c] === b) return c;
    return -1
}
jQuery.fn.makeTask = function () {
    $(this).addClass("task").hideChildren("instant").setExpanded(false)
};
jQuery.fn.makeDroppable = function () {
    this.each(function () {
        if ($(this).is(".dropTarget")) $(this).getProject().is(".selected, .parent") || $(this).droppable({
            over: function () {
                $(this).getProject().before($("#sortDrop"))
            }
        });
        else $(this).is(".childrenEnd") && $(this).droppable({
            over: function () {
                $(this).before($("#sortDrop"))
            }
        })
    });
    return this
};
jQuery.fn.makeDraggable = function () {
    $(this).draggable({
        helper: "clone",
        cursor: "move",
        distance: 1,
        start: function (a, b) {
            var c = $(this).getProject();
            c.addClass("moving");
            b.helper.movedProjectId = c.attr("projectid");
            c = c.find(".dropTarget:visible, .childrenEnd:visible");
            $(".dropTarget:visible, .childrenEnd:visible").not(c).makeDroppable()
        },
        stop: function (a, b) {
            var c = getProjectByProjectId(b.helper.movedProjectId),
                d = $("#sortDrop");
            if (c.length == 1) {
                c.removeAttr("style");
                if (d.is(":visible")) {
                    var e = d.next(".project, .childrenEnd");
                    c = c.moveProject(e);
                    c.addClass("moving")
                }
                setTimeout(function () {
                    $(".moving").removeClass("moving")
                }, 500)
            }
            $(".dropTarget.ui-droppable, .childrenEnd.ui-droppable").droppable("destroy");
            d.appendTo("#hidden");
            styleAllEditAreas()
        }
    });
    return this
};

function getFinishedProjectsToAnimate() {
    var a = $(".selected > .children > .project.done, .selected > .children > .project.completedDescendantMatches:not(.matches,.uncompletedDescendantMatches), .selected .project.open:visible > .children > .project.done, .selected .project.open:visible > .children > .project.completedDescendantMatches:not(.matches,.uncompletedDescendantMatches)");
    a = a.filterVisibleProjects(true);
    return a = a.slice(0, 10)
}

function showCompleted(a) {
    a = getAnimationSpeed(a);
    $("body").addClass("showCompleted");
    if (a != "instant") {
        a = getFinishedProjectsToAnimate();
        a.hide();
        a.incrementAnimationCounter().slideDown(ANIMATION_SPEEDS.children, function () {
            $(this).removeAttr("style");
            ANIMATION_COUNTER.decrement()
        })
    } else IS_MOBILE || refocusEditingProject();
    $(".showCompletedButton > .show").hide();
    $(".showCompletedButton > .hide").show();
    storeCompletedMode("show")
}

function hideCompleted(a) {
    a = getAnimationSpeed(a);
    var b = null,
        c = $(".content.lastEdited");
    if (c.length > 0) for (b = c.getProject(); b.is(".done");) {
        c = b;
        b = b.getPreviousProject();
        if (c.filter(b).length != 0) {
            b = null;
            break
        }
    }
    if (b != null) {
        ANIMATION_COUNTER.contentToFocus = b.getName().children(".content");
        if ($(".content.lastEdited").filter(ANIMATION_COUNTER.contentToFocus).length > 0) ANIMATION_COUNTER.cursorPos = $(".editor.lastEdited").children("textarea").getCaret().start
    }
    $("body").removeClass("showCompleted");
    if (a != "instant") {
        a = getFinishedProjectsToAnimate();
        a.show();
        a.incrementAnimationCounter().slideUp(ANIMATION_SPEEDS.children, function () {
            $(this).removeAttr("style");
            ANIMATION_COUNTER.decrement()
        })
    } else IS_MOBILE || refocusEditingProject();
    $(".showCompletedButton > .show").show();
    $(".showCompletedButton > .hide").hide();
    storeCompletedMode("hide")
}
function storeCompletedMode(a) {
    if (LOCAL_STORAGE_SUPPORTED) {
        var b = localStorageKey("completedMode");
        writeLocalStorage(b, a)
    }
}

function shouldShowCompletedProjects() {
    return $(".showCompletedButton > .hide").is(":visible")
}
jQuery.fn.contentChanged = function () {
    var a = $(this),
        b = a.data("oldText");
    a = a.getContentText();
    $(this).data("oldText", a);
    return b == undefined ? false : b != a
};
jQuery.fn.contentIsEditable = function () {
    if (DISABLE_EDITING) return false;
    if ($(this).getProject().is("#workflowy")) return false;
    return true
};
jQuery.fn.editorHasChangedContent = function () {
    var a = $(this),
        b = a.getContentTarget();
    a = a.children("textarea").val();
    b = b.data("oldText");
    return b == undefined ? false : a != b
};
jQuery.fn.saveContent = function () {
    var a = $(this),
        b = a.getProject();
    if (a.contentChanged()) {
        var c = a.getContentText();
        a = a.parent(".name").length > 0;
        b = {
            projectid: b.attr("projectid")
        };
        if (a) b.name = c;
        else b.description = c;
        applyLocalOperationAndAddToPendingQueue("edit", b)
    }
};
jQuery.fn.isDoubleClick = function () {
    var a = new Date,
        b = $(this).data("lastClicked");
    $(this).data("lastClicked", a.getTime());
    if (b != undefined) {
        if (a - new Date(b) < 250) return true
    } else return false
};

function clearSelection() {
    if (document.selection && document.selection.empty) document.selection.empty();
    else window.getSelection && window.getSelection().removeAllRanges()
}
jQuery.fn.getEditor = function () {
    var a = $(this),
        b = false;
    $(".editor").each(function (c, d) {
        if ($(d).data("content") != null && $(d).data("content")[0] == a[0]) {
            b = $(d);
            return false
        }
    });
    return b
};
jQuery.fn.detachEditorsForProject = function () {
    var a = $(this),
        b = a.getName().getEditor();
    a = a.getNotes().getEditor();
    b && b.hideEditor();
    a && a.hideEditor()
};
jQuery.fn.placeEditArea = function (a) {
    if (a === undefined) a = null;
    var b = $(this).hasClass("content") ? $(this) : $(this).children(".content");
    if (!b.contentIsEditable()) return null;
    var c = b.getEditor();
    if (a == null) a = c != false ? c : IS_MOBILE ? $(".editor").first() : $(".editor:not(.lastEdited)").first();
    var d = a.children("textarea");
    if (c == false || $(a)[0] != $(c)[0]) {
        IS_MOBILE && d.blurHandler();
        a.data("content", b);
        b.setEditorClasses();
        d.val(b.getContentText());
        IS_MOBILE && d.focusHandler()
    } else b.setEditorClasses();
    d.show();
    a.styleEditArea();
    return d
};
jQuery.fn.setEditorClasses = function () {
    var a = $(this),
        b = a.getEditor(),
        c = a.getProject();
    b.removeClass("nameEditor noteEditor selectedEditor doneEditor");
    a.parent().hasClass("name") ? b.addClass("nameEditor") : b.addClass("noteEditor");
    c.hasClass("selected") && b.addClass("selectedEditor");
    c.hasClass("done") && b.addClass("doneEditor")
};
jQuery.fn.focusEditorTextArea = function () {
    if (!(ANIMATION_COUNTER.animationsInProgress > 0)) {
        clearTimeout(TIMEOUTS.blur);
        blurFocusedTextarea($(this));
        $(this).focus();
        return $(this)
    }
};
jQuery.fn.focusContent = function (a, b) {
    var c = $(this),
        d = c.placeEditArea();
    a !== undefined && d !== null && d.setCaret(a, b);
    return c
};

function refocusEditingProject() {
    if (!(ANIMATION_COUNTER.animationsInProgress > 0)) {
        var a = $(".editor.lastEdited");
        $(".content.lastEdited").is(":visible") && a.styleEditArea().children("textarea").focusEditorTextArea()
    }
}
jQuery.fn.focusProject = function () {
    if (!(ANIMATION_COUNTER.animationsInProgress > 0)) {
        var a = $(this),
            b = a.children(".name").find(".content").getEditor();
        b.length > 0 ? b.find("textarea").focusEditorTextArea() : a.getName().moveCursorToBeginning();
        return this
    }
};

function styleAllEditAreas() {
    $(".editor").styleEditArea()
}
jQuery.fn.styleEditArea = function () {
    $(this).each(function () {
        var a = $(this),
            b = a.getContentTarget(),
            c = a.children("textarea"),
            d = b == undefined ? null : b.getProject();
        if (b == undefined || d.hasClass("parent") || !b.is(":visible")) IS_MOBILE ? a.hideEditor("blur") : a.hideEditor();
        else if (b != undefined) {
            c = textToHtml(c.val());
            if (b.isNote(true)) c += "<div class='spacer'>.</div>";
            b.setContentHtml(c);
            c = b.outerHeight() + 2;
            if (a.hasClass("fixed") && !IS_ANDROID) c += parseInt(b.css("lineHeight"));
            a.height(c);
            c = b.offset();
            a.offset({
                top: Math.floor(c.top),
                left: Math.floor(c.left)
            });
            b = b.outerWidth();
            if (IS_IOS) b -= 6;
            else if (IS_ANDROID) b -= 10;
            else if (IS_IE) b += 4;
            if (IS_FIREFOX) b += 2;
            a.width(b).css("display", "block")
        }
    });
    return this
};

function textToHtml(a) {
    var b = Array(a.length);
    if (SEARCH_MODE) for (var c in SEARCH_TOKEN_REGEXP_LIST) {
        var d = SEARCH_TOKEN_REGEXP_LIST[c];
        for (d.lastIndex = 0;;) {
            var e = d.exec(a);
            if (e == null) break;
            var f = e[2];
            for (var g = e = e.index + e[1].length; g < e + f.length; g++) b[g] = true
        }
    }
    c = [];
    for (URL_REGEXP.lastIndex = 0;;) {
        e = URL_REGEXP.exec(a);
        if (e == null) break;
        c.push({
            type: "url",
            spanStart: e.index,
            spanLength: e[0].length
        })
    }
    if (!IS_MOBILE) for (TAG_REGEXP.lastIndex = 0;;) {
        e = TAG_REGEXP.exec(a);
        if (e == null) break;
        c.push({
            type: "tag",
            spanStart: e.index + e[1].length,
            spanLength: e[2].length
        })
    }
    c.sort(function (l, j) {
        if (l.spanStart == j.spanStart) return 0;
        return l.spanStart < j.spanStart ? -1 : 1
    });
    d = "";
    g = 0;
    for (var i in c) {
        f = c[i];
        e = f.spanStart;
        if (!(e < g)) {
            d += highlightSearchMatchesAndHtmlEscapeText(a, b, g, f.spanStart);
            var h = e + f.spanLength;
            g = a.substring(e, h);
            g = htmlEscapeText(g);
            switch (f.type) {
            case "url":
                e = highlightSearchMatchesAndHtmlEscapeText(a, b, e, h);
                d += '<a class="contentLink" target="_blank" href="' + g + '">' + e + "</a>";
                break;
            case "tag":
                var n = highlightSearchMatchesAndHtmlEscapeText(a, b, e, e + 1);
                e = highlightSearchMatchesAndHtmlEscapeText(a, b, e + 1, h);
                d += '<span class="contentTag">' + n + '<span class="contentTagText">' + e + '</span><div class="contentTagClickable" data-tag="' + g + '" title="Filter ' + g + '"></div></span>'
            }
            g = f.spanStart + f.spanLength
        }
    }
    d += highlightSearchMatchesAndHtmlEscapeText(a, b, g, a.length);
    return d
}

function highlightSearchMatchesAndHtmlEscapeText(a, b, c, d) {
    if (!SEARCH_MODE) return htmlEscapeText(a.substring(c, d));
    var e = "";
    for (c = c; c < d;) {
        for (var f = c, g = b[c]; c < d && b[c] == g;) c++;
        f = a.substring(f, c);
        f = htmlEscapeText(f);
        e += g ? '<span class="contentMatch">' + f + "</span>" : f
    }
    return e
}
function htmlEscapeText(a) {
    return a.replace(/&/g, "&amp;").replace(/>/g, "&gt;").replace(/</g, "&lt;")
}

function htmlToText(a) {
    a.find(".contentMatch").each(function () {
        $(this).replaceWith($(this).html())
    });
    a.children(".contentLink").each(function () {
        $(this).replaceWith($(this).html())
    });
    a.children(".contentTag").each(function () {
        $(this).replaceWith($(this).find(".contentTagClickable").attr("data-tag"))
    });
    return a.html().replace(/&lt;/ig, "<").replace(/&gt;/ig, ">").replace(/&amp;/ig, "&")
}
jQuery.fn.setContentHtml = function (a) {
    $(this).html(a)
};
jQuery.fn.getContentText = function () {
    var a = $(this).clone();
    $(".spacer", a).remove();
    return htmlToText(a)
};
jQuery.fn.hideEditor = function (a) {
    if (a === undefined) a = false;
    $(this).each(function () {
        var b = $(this),
            c = b.getContentTarget(),
            d = b.children("textarea").val("").removeAttr("style");
        a != false && $(document.activeElement)[0] == d[0] && d.blur();
        b.removeData("content");
        b.removeAttr("style");
        b.css({
            top: 0,
            left: 0,
            height: 0,
            width: 0,
            display: "none"
        });
        b.removeClass("fixed").removeClass("lastEdited");
        c != null && c.removeClass("editing").removeClass("lastEdited")
    });
    return this
};

function addEvents() {
    $("#site_message .closeButton").click(function () {
        closeSiteMessage()
    });
    if (IS_MOBILE) jQuery.fn.firstTap = function () {
        unTap();
        var b = $(this),
            c = b.getProject();
        b.addClass("firstTap");
        b.isName() && c.showControls()
    };
    $(window).bind("beforeunload", function () {
        if (PENDING_OPERATION_QUEUE.length > 0 || IN_FLIGHT_OPERATION_QUEUE.length > 0) return "This document has unsaved changes. Do you want to leave this page and discard your changes?"
    });
    var a = window.orientation != undefined ? "orientationchange" : "resize";
    $(window).bind(a, function () {
        if (IS_MOBILE) {
            var b = $("#workflowy > .children");
            clearInterval(TIMEOUTS.orientation);
            TIMEOUTS.loops = 0;
            var c = parseInt(b.width());
            TIMEOUTS.orientation = setInterval(function () {
                var d = parseInt(b.width());
                TIMEOUTS.loops++;
                if (d != c || TIMEOUTS.loops > 20) {
                    $(".editor").styleEditArea();
                    clearInterval(TIMEOUTS.orientation)
                }
            }, 50)
        } else {
            setPageMargins();
            styleAllEditAreas()
        }
    });
    $.address.externalChange(function () {
        selectAndSearchUsingFragment()
    });
    $(window).focus(function () {
        WINDOW_FOCUSED = true;
        readLocalStorageExpandedProjects();
        scheduleNextPushOrPoll(false, true)
    });
    $(window).blur(function () {
        WINDOW_FOCUSED = false
    });
    $("body.saveNow .saveButton").live("click", function () {
        IS_MOBILE || refocusEditingProject();
        scheduleNextPushOrPoll(true)
    });
    if (IS_MOBILE) {
        $("#newControls a.complete").live("touchstart", function () {
            $(this).getProject().completeIt();
            setTimeout(function () {
                $("#newControls").css({
                    height: 0
                });
                setTimeout(function () {
                    unTap()
                }, 200)
            }, 300);
            return false
        });
        $("#newControls a.note").live("click", function () {
            $(this).getProject().editNote();
            return false
        });
        $("#newControls #moveMobile span").live("touchstart", function () {
            var b = $(this);
            b.css("background", "#ccc");
            setTimeout(function () {
                b.removeAttr("style")
            }, 100);
            return false
        }).live("touchend", function () {
            var b = $(this),
                c = b.getProject(),
                d = c.attr("projectid");
            if (b.hasClass("indent")) var e = c.indentProject();
            else if ($(this).hasClass("dedent")) e = c.dedentProject();
            if (e) {
                c = $(".project[projectid=" + d + "]");
                b = $(window).height();
                $("body").addClass("moveScroll").animate({
                    scrollTop: c.offset().top - b / 2
                }, 200, function () {
                    editor = $(".editor.fixed");
                    if (editor.length !== 0) {
                        editor.styleEditArea();
                        c.showControls()
                    } else c.getName().children(".content").firstTap()
                })
            }
            return false
        })
    }
    IS_MOBILE || $("#newControls").live("click", function (b) {
        var c = $(this).getProject();
        switch ($(b.target).closest("a").attr("class")) {
        case "complete":
            c.completeIt();
            break;
        case "delete":
            c.deleteIt();
            break;
        case "export":
            c.exportIt();
            break;
        case "note":
            c.editNote();
            break;
        case "share":
            c.showSharePopup()
        }
        TIMEOUTS.highlight = setTimeout(function () {
            $(".highlighted").removeClass("highlighted")
        }, 300)
    });
    if (!IS_MOBILE) {
        jQuery.fn.initiateHideHoverControls = function () {
            var b = $(this).getProject(),
                c = b.children(".name").find("#newControls");
            b.removeClass("highlighted");
            clearTimeout(TIMEOUTS.showControls);
            TIMEOUTS.hideHoverControls = setTimeout(function () {
                c.removeClass("hovered");
                $("#expandButton").removeClass("controlsShow")
            }, 1)
        };
        jQuery.fn.initiateShowHoverControls = function () {
            var b = $(this).getProject();
            $(".highlighted").removeClass("highlighted");
            b.is(".selected") || b.addClass("highlighted");
            clearTimeout(TIMEOUTS.hideHoverControls);
            TIMEOUTS.showControls = setTimeout(function () {
                b.showControls()
            }, 500)
        };
        $(".bullet, .controlsShow").live("mouseenter", function () {
            $(this).initiateShowHoverControls()
        }).live("mouseleave", function () {
            $(this).initiateHideHoverControls()
        });
        $("#newControls").mouseenter(function () {
            var b = $(this).getProject();
            $(".highlighted").removeClass("highlighted");
            b.addClass("highlighted");
            clearTimeout(TIMEOUTS.hideHoverControls)
        }).mouseleave(function () {
            $(this).initiateHideHoverControls()
        });
        $(".selected .name").live("mouseenter", function () {
            $(this).addClass("hovered");
            $(this).placeControls()
        }).live("mouseleave", function () {
            $(this).removeClass("hovered");
            TIMEOUTS.hideControls = setTimeout(function () {
                hideControls()
            }, 1)
        });
        $(".selected:not(#workflowy) > .name").live("mouseenter", function () {
            $(this).initiateShowHoverControls()
        }).live("mouseleave", function () {
            $(this).initiateHideHoverControls()
        });
        $(".editor").live("mouseenter", function () {
            var b = $(this),
                c = b.getContentTarget();
            clearTimeout(TIMEOUTS.hideControls);
            if (c != null) {
                b.children("textarea").show();
                b.styleEditArea();
                if (!c.hasClass("hovered")) {
                    $(".content.hovered").removeClass("hovered");
                    c.addClass("hovered")
                }
                c.parent(".name").length > 0 && !c.getProject().hasClass("parent") && c.parent(".name").placeControls();
                if (!b.hasClass("hovered")) {
                    $(".editor.hovered").removeClass("hovered");
                    b.addClass("hovered")
                }
                if (c.isName()) {
                    c.parent(".name").addClass("hovered");
                    b = c.getProject();
                    b.hasClass("selected") && b.initiateShowHoverControls()
                }
            }
        }).live("mouseleave", function () {
            var b = $(this).getContentTarget();
            if (b != null) {
                var c = b.getProject();
                if (b.isName()) {
                    b.parent(".name").removeClass("hovered");
                    c.hasClass("selected") && c.initiateHideHoverControls()
                }
                TIMEOUTS.hideControls = setTimeout(function () {
                    hideControls()
                }, 1)
            }
        })
    }
    jQuery.fn.placeControls = function () {
        clearTimeout(TIMEOUTS.hideControls);
        var b = $(this),
            c = $(this).children("#controls");
        if ($(".moving").length > 0) return true;
        if (c.length == 0) {
            hideControls();
            $(this).append($("#controls"));
            clearTimeout(TIMEOUTS.hideHoverControls)
        }
        $("#move", b).draggable("destroy").makeDraggable()
    };
    jQuery.fn.showControls = function () {
        var b = $(this);
        if (IS_MOBILE) {
            c = b.children(".name").children("#controls");
            c.length == 0 && b.children(".name").append($("#controls"));
            $("#newControls").width($(window).width() - 20).offset({
                top: $(document).scrollTop(),
                left: 10
            });
            b = $("#newControls .panel");
            b.addClass("visible");
            editMode() ? b.animate({
                width: "95px"
            }, 200) : b.css({
                width: "100%"
            })
        } else {
            var c = b.children(".name").find("#newControls");
            c.find(".panel, .handle").fadeIn(50, function () {
                $(this).removeAttr("style")
            });
            c.addClass("hovered");
            $("#expandButton").addClass("controlsShow")
        }
    };
    IS_MOBILE || $(".selected .content").live("mouseenter", function () {
        var b = $(this);
        if (b.contentIsEditable()) {
            if (!b.hasClass("hovered")) {
                $(".content.hovered").removeClass("hovered");
                b.addClass("hovered")
            }
            b.placeEditArea()
        }
    });
    if (IS_MOBILE) {
        $("body").bind("touchstart", function (b) {
            if ($(".editor").hasClass("fixed")) $(b.target).closest("#controls").length === 0 && hideControls();
            else $(b.target).closest(".firstTap").length == 0 && $(".firstTap").length > 0 && $(b.target).closest("#controls").length == 0 && unTap()
        });
        $(window).scroll(function () {
            clearTimeout(TIMEOUTS.scroll);
            TIMEOUTS.scroll = setTimeout(function () {
                if ($(".editor").hasClass("fixed") || $("body").hasClass("moveScroll")) {
                    $("body").removeClass("moveScroll");
                    $(".content.editing").getProject().showControls()
                } else unTap()
            }, 250)
        });
        $(".selected .content").live("touchstart", function () {
            var b = $(this);
            b.getProject();
            if (!b.hasClass("firstTap")) {
                clearTimeout(TIMEOUTS.longtap);
                TIMEOUTS.longtap = setTimeout(function () {
                    $(".firstTap").removeClass("firstTap");
                    b.addClass("firstTap")
                }, 250)
            }
            EVENTS.contentMoved = false
        }).live("touchmove", function () {
            if (EVENTS.contentMoved == false) {
                EVENTS.contentMoved = true;
                clearTimeout(TIMEOUTS.longtap);
                $(".editor").hasClass("fixed") || unTap()
            }
        }).live("touchend", function () {
            clearTimeout(TIMEOUTS.longtap);
            var b = $(this);
            b.getProject();
            if (!(DISABLE_EDITING && !NORMAL_USAGE)) if (EVENTS.contentMoved == true) EVENTS.contentMoved = false;
            else if ($(".editor").hasClass("fixed") && $(".firstTap").length > 0) {
                $(".firstTap").removeClass("firstTap");
                b.placeEditArea()
            } else if ($(".editor").hasClass("fixed")) {
                $(".editor").children("textarea").blur();
                unTap()
            } else if (b.hasClass("firstTap")) {
                $(".firstTap").removeClass("firstTap");
                b.placeEditArea()
            } else {
                b.firstTap();
                return false
            }
        })
    }
    if (IS_MOBILE) {
        $(".parent > .name").addMobileZoomControlEvents();
        $(".selected .project .parentArrow").live("touchstart", function () {}).live("touchmove", function () {
            $(this).data("moved", true)
        }).live("touchend", function (b) {
            if ($(this).data("moved") != true) {
                b.stopImmediatePropagation();
                var c = $(this).getProject();
                c.addClass("tapped");
                setTimeout(function () {
                    c.removeClass("tapped")
                }, 200);
                c.clickExpandButton();
                $(".editor.lastEdited").styleEditArea();
                return false
            }
            $(this).data("moved", false)
        })
    }
    if (!IS_MOBILE) {
        $(".selected .content .contentLink, .selected .content .contentTagClickable").live("mouseenter", function () {
            var b = $(this).closest(".content").getEditor();
            if (b != false && !b.hasClass("fixed")) {
                b.children("textarea").hide();
                return false
            }
        });
        $(".selected .content .contentTagClickable").live("click", function () {
            var b = $(this).attr("data-tag");
            if (tagIsInCurrentSearch(b)) toggleTagInCurrentSearch(b);
            else {
                var c = $(this).closest(".contentTag"),
                    d = $('<div class="contentTagAnimated">' + b + "</div>");
                $("#visible").append(d);
                d.css({
                    position: "absolute",
                    zIndex: 100,
                    backgroundColor: "#bbb",
                    color: "#555",
                    fontSize: c.css("fontSize"),
                    lineHeight: c.css("lineHeight")
                });
                d.offset($("#searchBox").offset());
                var e = d.position();
                d.offset(c.offset());
                d.animate({
                    top: e.top,
                    left: e.left,
                    opacity: "0.5"
                }, ANIMATION_SPEEDS.zoom, function () {
                    $(this).remove();
                    toggleTagInCurrentSearch(b)
                });
                return false
            }
        })
    }
    $(".selected .content .contentLink").live("click", function () {
        var b = $(this).attr("href");
        _gat._getTrackerByName()._trackEvent("Link Click", "Content Link", b)
    });
    a = "click";
    if (IS_MOBILE) a = "touchstart";
    $(".showCompletedButton").live(a, function () {
        shouldShowCompletedProjects() ? hideCompleted() : showCompleted()
    });
    $("#logo").click(function () {
        if (!(ANIMATION_COUNTER.animationsInProgress > 0)) {
            var b = $("#workflowy");
            b.is(".selected") || b.selectIt()
        }
    }).dblclick(function () {
        var b = $("#workflowy");
        if (b.is(".selected")) {
            b.expandOrCollapseAllDescendantsOfProjectToggle();
            clearSelection()
        }
    });
    if (!IS_MOBILE) {
        $(".project.parent > .name > .content").live("click", function () {
            $(this).getProject().selectIt();
            return false
        });
        $(".editor").live("dblclick", function () {
            var b = $(this).getContentTarget(),
                c = b.getProject();
            if (c.hasClass("selected") && b.isName()) {
                c.expandOrCollapseAllDescendantsOfProjectToggle();
                $(document.activeElement).setCaret(0);
                return false
            }
        })
    }
    $("#expandButton").live("click", function () {
        $(this).clickExpandButton();
        return false
    });
    IS_MOBILE ? $(".bullet").addMobileZoomControlEvents() : $(".bullet").live("click", function (b) {
        if (!(b.ctrlKey || b.metaKey)) {
            $(this).getProject().selectIt();
            return false
        }
    });
    $("a.undelete").live("click", function () {
        $(this).undeleteIt();
        return false
    });
    $("#message > .close").click(function () {
        hideMessage()
    });
    IS_MOBILE || $("#controlsRight").hover(function () {
        $(this).getProject().addClass("highlighted").addClass("moveHovered")
    }, function () {
        $(this).getProject().removeClass("highlighted").removeClass("moveHovered")
    }).mousedown(function () {
        blurFocusedTextarea()
    });
    $("a.refresh").live("click", function () {
        window.location.reload();
        return false
    });
    a = $("#workflowy > .add.lastChild");
    a.live("click", function () {
        $(".selected").appendChildProject();
        return false
    });
    IS_MOBILE && a.live("touchstart", function () {
        var b = $(this);
        b.addClass("tapped");
        setTimeout(function () {
            b.removeClass("tapped")
        }, 100)
    });
    $(".editor > textarea").addTextAreaKeyboardShortcuts();
    $(window).addGlobalKeyboardShortcuts();
    $("#loginPopup").dialog({
        autoOpen: false,
        width: 450,
        buttons: {
            Login: function () {
                $("#loginPopup form").submit()
            }
        },
        modal: true,
        position: ["center", 180],
        title: "Login required for " + $("input[type=hidden][name=username]").val(),
        dialogClass: "noClose",
        closeOnEscape: false
    });
    $("#helpWindow .startLink").click(function () {
        $("#helpWindow").dialog("close")
    });
    $("#helpWindow").dialog({
        autoOpen: false,
        width: 750,
        buttons: {
            Close: function () {
                $(this).dialog("close")
            }
        },
        modal: true,
        position: ["center", 80],
        title: "WorkFlowy Help",
        close: function () {
            refocusEditingProject()
        }
    });
    $("#exportPopup").dialog({
        autoOpen: false,
        width: 550,
        buttons: {
            Close: function () {
                $(this).dialog("close")
            }
        },
        modal: true,
        position: ["center", 150],
        title: "Export List"
    });
    jQuery.fn.setShareButtons = function (b) {
        b ? $(this).dialog("option", {
            buttons: {
                "Turn off sharing for this list": function () {
                    unshareProject($(this).data("projectid"))
                },
                Close: function () {
                    $(this).dialog("close")
                }
            }
        }) : $(this).dialog("option", {
            buttons: {
                "Option 1: Let people view": function () {
                    shareProject($(this).data("projectid"), false)
                },
                "Option 2: Let people edit": function () {
                    shareProject($(this).data("projectid"), true)
                },
                Cancel: function () {
                    $(this).dialog("close")
                }
            }
        })
    };
    $("#sharePopup").dialog({
        autoOpen: false,
        width: 750,
        modal: true,
        position: ["center", 200],
        title: "Share list"
    });
    $("#helpRadio, .buttonset").buttonset();
    $("#helpRadio :radio").click(function () {
        $("#helpWindow .pane").hide();
        $("#helpWindow .pane." + $(this).data("pane")).show()
    });
    $("#sharePopup .is_editable.buttonset :radio").click(function () {
        var b = $("#sharePopup").data("projectid"),
            c = $(this).data("editable") === true;
        shareProject(b, c)
    });
    $("#helpButton").click(function () {
        $("#helpWindow").dialog("open");
        return false
    });
    $("#loginPopupContents .loginForm").submit(function () {
        var b = $(this),
            c = $("#loginPopup");
        if (b.hasClass("submitting")) return false;
        b.addClass("submitting");
        c.setDialogButtonsDisable(true);
        var d = {};
        b.find(":input").each(function () {
            d[$(this).attr("name")] = $(this).val()
        });
        var e = function () {
                b.removeClass("submitting");
                c.setDialogButtonsDisable(false);
                b.find(".loginFormErrorMessage").text("Server did not respond. Please try again.").show();
                b.find(".loginFormPasswordInput").focus()
            };
        $.ajax({
            url: "/ajax_login",
            data: d,
            dataType: "json",
            type: "POST",
            success: function (f) {
                if (f == null) e();
                else if ("success" in f && f.success) {
                    hideLoginPopup();
                    if (IN_FLIGHT_OPERATION_QUEUE.length > 0) reschedulePushOnError();
                    else POLL_IN_PROGRESS && reschedulePollOnError()
                } else {
                    b.removeClass("submitting");
                    c.setDialogButtonsDisable(false);
                    b.find(".loginFormErrorMessage").text("Incorrect password.").show();
                    f = b.find(".loginFormPasswordInput");
                    f.val("");
                    f.focus()
                }
            },
            error: e
        });
        return false
    });
    $("#exportPopupContents form input.htmlButton, #exportPopupContents form input.textButton").change(function () {
        var b = $(this),
            c = $("#exportPopup"),
            d = c.children(".previewWindow"),
            e = d.html();
        d.html("");
        var f = c.children(".htmlContainer");
        c = c.children(".textContainer");
        if (b.hasClass("htmlButton")) {
            c.html(e);
            d.html(f.html());
            f.html("")
        } else {
            f.html(e);
            d.html(c.html());
            c.html("")
        }
        d.focus();
        selectElementText(d.get()[0])
    });
    $("#exportAll").click(function () {
        $("#workflowy").exportIt();
        return false
    });
    $("#searchForm").submit(function () {
        searchWithSearchBox();
        return false
    });
    $("#searchPrompt").click(function () {
        $("#searchBox").focus()
    });
    $("#searchBox").bind("keydown", function (b) {
        if (!(b.keyCode == $.ui.keyCode.TAB || b.keyCode == $.ui.keyCode.ESCAPE)) {
            clearTimeout(TIMEOUTS.search);
            TIMEOUTS.search = setTimeout(function () {
                var c = $("#searchBox").val().length;
                c = c == 0 || c > 2 ? 1 : 500;
                clearTimeout(TIMEOUTS.search);
                TIMEOUTS.search = setTimeout(function () {
                    searchWithSearchBox()
                }, c)
            }, 1)
        }
    }).bind("keydown", "tab", function () {
        focusFirstProject();
        return false
    }).focus(function () {
        $("#searchForm").addClass("clearPrompt")
    }).blur(function () {
        var b = $("#searchForm");
        $.trim($(this).val()).length > 0 ? b.addClass("clearPrompt") : b.removeClass("clearPrompt")
    }).addGlobalKeyboardShortcuts();
    $("#searchCancel").click(function () {
        cancelSearch()
    })
}
function setPageMargins() {
    var a = $("#visible"),
        b = Math.floor(($(window).width() - a.outerWidth()) / 2);
    if (b < 0) b = 0;
    a.css({
        marginLeft: b
    })
}
jQuery.fn.addMobileZoomControlEvents = function () {
    $(this).live("touchstart", function () {
        var a = $(this).getProject();
        a.addClass("tapped");
        setTimeout(function () {
            a.removeClass("tapped")
        }, 500);
        $(this).data("cancelTap", false);
        return false
    }).live("touchmove", function () {
        $(this).data("cancelTap", true)
    }).live("touchend", function () {
        var a = $(this).getProject();
        $(this).data("cancelTap") == false && setTimeout(function () {
            a.selectIt()
        }, 1);
        return false
    })
};

function searchWithSearchBox() {
    if ("search" in TIMEOUTS) {
        clearTimeout(TIMEOUTS.search);
        delete TIMEOUTS.search
    }
    searchProjectTree($("#searchBox").val());
    $(window).scrollTop(0);
    clearTimeout(TIMEOUTS.setSearchInFragment);
    TIMEOUTS.setSearchInFragment = setTimeout(function () {
        $.address.parameter("q", $("#searchBox").val())
    }, 1E3)
}
function setSearchBoxAndSearch(a) {
    $("#searchBox").val(a);
    $.trim(a).length > 0 && $("#searchForm").addClass("clearPrompt");
    $.address.parameter("q", a);
    searchWithSearchBox()
}

function cancelSearch() {
    if (SEARCH_MODE) {
        $("#searchBox").val("");
        searchWithSearchBox()
    }
}
function toggleTagInCurrentSearch(a) {
    var b = $("#searchBox").val();
    if (tagIsInCurrentSearch(a)) b = b.replace(tagMatchingRegExp(a), "");
    else b += " " + a;
    b = $.trim(b) + " ";
    setSearchBoxAndSearch(b)
}
function tagMatchingRegExp(a) {
    return RegExp("(^|\\s)" + a + "(?=$|\\s)", "ig")
}
function tagIsInCurrentSearch(a) {
    return $("#searchBox").val().match(tagMatchingRegExp(a)) !== null
}
jQuery.fn.clickExpandButton = function () {
    ANIMATION_COUNTER.animationType = "expand";
    var a = $(this).getProject();
    if (!a.is(".task")) {
        var b = $(this).isDoubleClick(),
            c = a.getName(),
            d = c.children(".content").getEditor();
        ANIMATION_COUNTER.contentToFocus = c;
        if (d != false && d.is(".lastEdited")) if (b) d.children("textarea").focusEditorTextArea();
        else ANIMATION_COUNTER.cursorPos = d.children("textarea").getCaret().start;
        else b && c.moveCursorToBeginning();
        if (a.is(".open")) b ? a.expandOrCollapseAllDescendantsOfProject(true) : a.hideChildren().setExpanded(false);
        else b ? a.expandOrCollapseAllDescendantsOfProject(false) : a.showChildren().setExpanded(true)
    }
};
jQuery.fn.expandOrCollapseAllDescendantsOfProject = function (a) {
    function b(g) {
        var i = g.id;
        g = g.ch;
        if (g.length > 0) {
            d.push(i);
            for (var h in g) b(g[h])
        }
    }
    var c = $(this),
        d = [],
        e = c.getProjectTreeObjectForProject();
    e = getChildrenOfProjectTreeObject(e);
    for (var f in e) b(e[f]);
    setExpandedForProjectIds(d, a);
    c = c.getChildren().not(".task");
    a ? c.showChildren("instant") : c.hideChildren("instant");
    styleAllEditAreas()
};
jQuery.fn.expandOrCollapseAllDescendantsOfProjectToggle = function () {
    var a = $(this);
    a.find(".project:not(.open,.task)").length > 0 ? a.expandOrCollapseAllDescendantsOfProject(true) : a.expandOrCollapseAllDescendantsOfProject(false)
};
jQuery.fn.appendChildProject = function () {
    var a = $(this),
        b = a.children(".children").children(".childrenEnd").getPriority();
    a = createNewProject(a, b);
    a.getName().moveCursorToBeginning();
    if (IS_MOBILE) {
        a = a.offset().top - 50;
        $(window).scrollTop(a)
    }
};
jQuery.fn.editNote = function () {
    var a = $(this).getProject();
    a.addClass("noted");
    a.getNotes().moveCursorToEnd()
};
jQuery.fn.editName = function () {
    $(this).getProject().getName().moveCursorToEnd()
};
jQuery.fn.getName = function () {
    return $(this).children(".name")
};
jQuery.fn.getNotes = function () {
    return $(this).children(".notes")
};
jQuery.fn.projectIsEmpty = function () {
    var a = $(this);
    return a.getName().children(".content").getContentText() == "" && a.getNotes().children(".content").getContentText() == "" && a.is(".task")
};
jQuery.fn.projectIsMergable = function () {
    var a = $(this);
    return a.is(".task") && a.getNotes().children(".content").getContentText() == "" && !a.is(".done")
};
jQuery.fn.caretAtEndOfText = function () {
    var a = $(this).val().length;
    $(this).getProject();
    if ($(this).getCaret().start == a) return true;
    return false
};
jQuery.fn.caretAtBeginningOfText = function () {
    if ($(this).getCaret().start == 0) return true;
    return false
};
jQuery.fn.focusHandler = function () {
    clearTimeout(TIMEOUTS.blur);
    var a = $(this).closest(".editor");
    if (!a.is(".fixed")) {
        $(".editor.fixed").removeClass("fixed");
        a.addClass("fixed");
        var b = $(this).getContentTarget();
        b.contentChanged();
        $(".editing").removeClass("editing");
        b.addClass("editing");
        $(".lastEdited").removeClass("lastEdited");
        b.add(a).addClass("lastEdited");
        a.styleEditArea()
    }
};
jQuery.fn.blurHandler = function () {
    var a = $(this).parent(".editor"),
        b = a.data("content");
    if (b != null) {
        var c = b.getProject();
        clearTimeout(TIMEOUTS.saveTimer);
        $(this).isNote() && b.getContentText() == "" && c.removeClass("noted");
        b.removeClass("editing");
        b.saveContent();
        a.removeClass("fixed");
        IS_MOBILE || a.styleEditArea()
    }
};
jQuery.fn.addTextAreaKeyboardShortcuts = function () {
    $(this).live("focus", function () {
        $(this).focusHandler();
        $("body").addClass("editMode");
        IS_MOBILE && $(this).getContentTarget().getProject().showControls()
    });
    $(this).live("blur", function () {
        $(this).blurHandler();
        $("body").removeClass("editMode");
        IS_MOBILE && unTap()
    });
    var a;
    a = $("body").hasClass("windows") || $("body").hasClass("linux") ? "alt" : "ctrl";
    $(this).bind("keydown", "alt+return", function () {
        return false
    });
    $(this).bind("keydown", "shift+return", function () {
        $(this).notesShortcut();
        return false
    });
    $(this).bind("keydown", "ctrl+shift+backspace", function () {
        $(this).getProject().deleteIt();
        return false
    });
    $(this).bind("keydown", "ctrl+return", function () {
        $(this).getProject().completeIt();
        return false
    });
    if (IS_FIREFOX) {
        $(this).bind("keypress", function (b) {
            if (!(b.ctrlKey || b.altKey || b.shiftKey)) switch (b.keyCode) {
            case $.ui.keyCode.DOWN:
                return $(this).downArrowHandler();
            case $.ui.keyCode.UP:
                return $(this).upArrowHandler();
            case $.ui.keyCode.LEFT:
                return $(this).leftArrowHandler();
            case $.ui.keyCode.RIGHT:
                return $(this).rightArrowHandler();
            case $.ui.keyCode.ENTER:
                return $(this).returnHandler()
            }
        });
        $(this).bind("keypress", $.fn.keyPressHandler)
    } else {
        $(this).bind("keydown", "down", $.fn.downArrowHandler);
        $(this).bind("keydown", "up", $.fn.upArrowHandler);
        $(this).bind("keydown", "left", $.fn.leftArrowHandler);
        $(this).bind("keydown", "right", $.fn.rightArrowHandler);
        $(this).bind("keydown", "return", $.fn.returnHandler);
        $(this).bind("keydown", $.fn.keyPressHandler)
    }
    $(this).bind("keydown", "ctrl+p", $.fn.upArrowHandler);
    $(this).bind("keydown", "ctrl+n", $.fn.downArrowHandler);
    $(this).bind("keydown", "backspace", function () {
        var b = $(this).getProject();
        if ($(this).isNote()) {
            if ($(this).val() == "") {
                b.children(".name").moveCursorToEnd();
                return false
            }
        } else {
            var c = $(this).getCaret();
            if (!(b.is(".selected") || c.start != 0 || c.start != c.end)) {
                c = b.getPreviousProject();
                var d = c.projectIsMergable();
                if (c.is(".selected") || c.filter(b).length != 0 || c.getParent().filter(b.getParent()).length == 0 || !d || IS_ANDROID) if (b.projectIsEmpty()) {
                    b.deleteIt();
                    return false
                } else return;
                b = c.getName().children(".content").getContentText();
                d = $(this).val();
                $(this).val(b + d);
                c.deleteIt(true);
                $(this).setCaret(b.length);
                return false
            }
        }
    });
    $(this).bind("keydown", "del", function () {
        var b = $(this).getProject();
        if (!$(this).isNote()) {
            var c = $(this).getCaret();
            if (!(b.is(".selected") || c.start != $(this).val().length || c.start != c.end)) {
                c = b.getNextProject();
                var d = b.projectIsMergable();
                if (!(c.filter(b).length != 0 || c.getParent().filter(b.getParent()).length == 0 || !d || IS_ANDROID)) {
                    d = $(this).val();
                    var e = c.getName(),
                        f = e.children(".content").getContentText();
                    b.deleteIt(true);
                    c.setProjectName(d + f);
                    e.focusContent(d.length);
                    return false
                }
            }
        }
    });
    $(this).bind("keydown", a + "+right", function () {
        $(this).keyboardZoomIn();
        return false
    });
    $(this).bind("keydown", a + "+left", function () {
        keyboardZoomOut();
        return false
    });
    $(this).bind("keydown", "ctrl+up", function () {
        $(this).keyboardCollapse();
        return false
    });
    $(this).bind("keydown", "ctrl+down", function () {
        $(this).keyboardExpand();
        return false
    });
    $(this).bind("keydown", a + "+shift+up", function () {
        $(this).moveProjectUp();
        return false
    });
    $(this).bind("keydown", a + "+shift+down", function () {
        $(this).moveProjectDown();
        return false
    });
    $(this).bind("keydown", a + "+shift+left", function () {
        $(this).dedentProject();
        return false
    });
    $(this).bind("keydown", a + "+shift+right", function () {
        $(this).indentProject();
        return false
    });
    IS_FIREFOX || $(this).bind("keydown", "ctrl+space", function () {
        $(this).keyboardExpandToggle();
        return false
    });
    $(this).bind("keydown", "tab", function () {
        $(this).isNote() ? $(this).insertTab() : $(this).indentProject();
        return false
    });
    $(this).bind("keydown", "shift+tab", function () {
        $(this).isName() && $(this).dedentProject();
        return false
    });
    $(this).addGlobalKeyboardShortcuts();
    $(this).bind("paste", function () {
        var b = $(this).getContentTarget();
        setTimeout(function () {
            b.handlePasteIntoContent()
        }, 1)
    })
};
jQuery.fn.addGlobalKeyboardShortcuts = function () {
    this.each(function () {
        $(this).bind("keydown", "meta+s", function () {
            saveShortcut();
            return false
        });
        $(this).bind("keydown", "ctrl+s", function () {
            saveShortcut();
            return false
        });
        $(this).bind("keydown", "esc", function () {
            if (SEARCH_MODE) {
                blurFocusedTextarea();
                cancelSearch();
                focusFirstProject()
            } else toggleSearchFocus();
            return false
        })
    });
    return this
};

function toggleSearchFocus() {
    $(document.activeElement).is("#searchBox") ? focusFirstProject() : $("#searchBox").focus()
}

function focusFirstProject() {
    var a = getVisibleProjects();
    a.length > 0 && a.first().getName().moveCursorToBeginning()
}
function saveShortcut() {
    var a = $(".content.editing");
    a.length == 1 && a.saveContent();
    scheduleNextPushOrPoll(true)
}
jQuery.fn.keyPressHandler = function () {
    var a = $(this),
        b = a.getContentTarget();
    if (b != null) {
        var c = b.getProject();
        IS_MOBILE || hideControls();
        c.removeClass("highlighted");
        clearTimeout(TIMEOUTS.saveTimer);
        TIMEOUTS.saveTimer = setTimeout(function () {
            b.saveContent()
        }, 1E3);
        setTimeout(function () {
            var d = a.getContentTarget();
            d != null && d[0] == b[0] && a.parent(".editor").styleEditArea()
        }, 1)
    }
};
jQuery.fn.downArrowHandler = function () {
    var a = $(this).getProject();
    if ($(this).isNote()) {
        if ($(this).caretAtEndOfText()) {
            a.getNextProject().children(".name").moveCursorToBeginning();
            return false
        }
    } else {
        var b = a.getNextProject();
        b.filter(a).length != 0 ? a.children(".name").moveCursorToEnd() : b.children(".name").moveCursorToBeginning();
        return false
    }
};
jQuery.fn.upArrowHandler = function () {
    var a = $(this).getProject();
    if ($(this).isNote()) {
        if ($(this).caretAtBeginningOfText()) {
            a.children(".name").moveCursorToBeginning();
            return false
        }
    } else {
        a.getPreviousProject().children(".name").moveCursorToBeginning();
        return false
    }
};
jQuery.fn.leftArrowHandler = function () {
    var a = $(this).isNote();
    if ($(this).caretAtBeginningOfText()) {
        var b = $(this).getProject();
        (a ? b : b.getPreviousProject()).children(".name").moveCursorToEnd();
        return false
    }
};
jQuery.fn.rightArrowHandler = function () {
    if ($(this).caretAtEndOfText()) {
        $(this).getProject().getNextProject().children(".name").moveCursorToBeginning();
        return false
    }
};
jQuery.fn.returnHandler = function () {
    if (!$(this).isNote()) {
        if (SEARCH_MODE) return false;
        var a = $(this).getProject();
        if ($(this).val() == "") if ($(this).dedentProject()) return false;
        var b = a.is(".selected") || $(this).caretAtEndOfText();
        if (IS_ANDROID) b = true;
        if (b) {
            if (a.is(".open, .selected")) {
                b = a;
                a = 0
            } else {
                b = a.getParent();
                a = a.getPriority() + 1
            }
            var c = createNewProject(b, a);
            c.getName().moveCursorToBeginning()
        } else {
            c = $(this).getCaret().start;
            b = $(this).val().substring(0, c);
            var d = $(this).val().substring(c);
            c = createNewProject(a.getParent(), a.getPriority());
            c.setProjectName(b);
            $(this).val(d);
            a.getName().moveCursorToBeginning()
        }
        return false
    }
};
jQuery.fn.handlePasteIntoContent = function () {
    var a = $(this),
        b = a.getEditor();
    b.length > 0 && b.styleEditArea();
    if (!a.isNote(true)) {
        var c = a.getContentText().split("\n");
        if (c.length != 1) {
            var d = c[0].replace(/\s*$/, "");
            a.setContentHtml(textToHtml(d));
            b.length > 0 && b.children("textarea").val(d);
            if (!SEARCH_MODE) {
                b = a.getProject();
                a = b.getParent();
                b = b.getPriority();
                var e = null;
                for (d = 1; d < c.length; d++) {
                    e = $.trim(c[d]);
                    var f = createNewProject(a, b + d);
                    f.setProjectName(e);
                    e = f
                }
                e.getName().moveCursorToEnd()
            }
        }
    }
};
jQuery.fn.setProjectName = function (a) {
    var b = $(this).getName().children(".content");
    b.contentChanged();
    b.setContentHtml(textToHtml(a));
    var c = b.getEditor();
    c != false && c.children("textarea").val(a);
    b.saveContent()
};
jQuery.fn.notesShortcut = function () {
    $(this).isName() ? $(this).editNote() : $(this).editName();
    return false
};
jQuery.fn.moveProjectUp = function () {
    if (!$(this).isNote()) {
        var a = $(this).getProject();
        if (a.is(".selected")) return false;
        var b = a.getPreviousProject();
        if (b.filter(a).length > 0 || b.is(".selected")) return false;
        var c = $(this).getCaret();
        b = b.getParents().length > a.getParents().length ? b.next(".project, .childrenEnd") : b;
        a.moveProject(b).getName().focusContent(c.start, c.end);
        return true
    }
};
jQuery.fn.moveProjectDown = function () {
    if (!$(this).isNote()) {
        var a = $(this).getProject();
        if (a.is(".selected")) return false;
        var b = a.getNextProject(a.find(".project:visible"));
        if (b.filter(a).length > 0) return false;
        var c = $(this).getCaret();
        b = b.getParents().length < a.getParents().length ? b : b.is(".open") ? b.children(".children").children(":first") : b.next(".project, .childrenEnd");
        a.moveProject(b).getName().focusContent(c.start, c.end);
        return true
    }
};
jQuery.fn.indentProject = function () {
    var a = $(this).getProject(),
        b = a.attr("projectid");
    if (a.is(".selected")) return false;
    var c = a.getPreviousSibling();
    if (c.filter(a).length > 0) return false;
    if ($("body").hasClass("editMode")) var d = $(".editor.fixed > textarea").getCaret();
    var e = c.children(".children").children(".childrenEnd");
    a.moveProject(e);
    c.is(".open") || c.showChildren("instant").setExpanded(true);
    $("body").hasClass("editMode") && getProjectByProjectId(b).getName().focusContent(d.start, d.end);
    return true
};
jQuery.fn.dedentProject = function () {
    var a = $(this).getProject();
    if (a.is(".selected")) return false;
    var b = a.getParent();
    if (b.is("#workflowy") || b.is(".selected")) return false;
    if ($("body").hasClass("editMode")) var c = $(".editor.fixed > textarea").getCaret();
    b = b.next(".project, .childrenEnd");
    a = a.moveProject(b);
    $("body").hasClass("editMode") && a.getName().focusContent(c.start, c.end);
    return true
};
jQuery.fn.insertTab = function () {
    var a = $(this),
        b = a.getCaret(),
        c = a.val();
    c = c.substring(0, b.start) + "\t" + c.substring(b.end);
    a.val(c);
    a.setCaret(b.start + 1)
};
jQuery.fn.getContentTarget = function () {
    return $(this).closest(".editor").data("content")
};
jQuery.fn.isName = function () {
    return $(this).is(".editor, textarea") ? $(this).getContentTarget().parent(".name").length > 0 : $(this).parent(".name").length > 0
};
jQuery.fn.isNote = function (a) {
    if (a === undefined) a = false;
    return (a ? $(this) : $(this).getContentTarget()).parent(".notes").length > 0
};

function createNewProject(a, b) {
    var c = $.generateUUID();
    applyLocalOperationAndAddToPendingQueue("create", {
        projectid: c,
        parentid: a.attr("projectid"),
        priority: b
    });
    return getProjectByProjectId(c)
}
jQuery.fn.isCursorOnLastLine = function () {};

function getVisibleProjects() {
    return $(".project:visible:not(.parent):not(#workflowy)")
}
jQuery.fn.getPreviousProject = function (a) {
    if (a === undefined) a = null;
    var b = $(this),
        c = getVisibleProjects();
    if (a != null) c = c.not(a);
    return c.index(b) > 0 ? c.eq(c.index(b) - 1) : b
};
jQuery.fn.getNextProject = function (a) {
    if (a === undefined) a = null;
    var b = $(this),
        c = getVisibleProjects();
    if (a != null) c = c.not(a);
    return c.index(b) < c.length - 1 ? c.eq(c.index(b) + 1) : b
};
jQuery.fn.getPreviousSibling = function () {
    var a = $(this),
        b = a.getParent().getVisibleChildren();
    return b.index(a) > 0 ? b.eq(b.index(a) - 1) : a
};
jQuery.fn.getNextSibling = function () {
    var a = $(this),
        b = a.getParent().getVisibleChildren();
    return b.index(a) < b.length - 1 ? b.eq(b.index(a) + 1) : a
};
jQuery.fn.moveCursorToEnd = function () {
    var a = $(this).placeEditArea();
    a !== null && a.setCaret(a.val().length);
    return this
};
jQuery.fn.moveCursorToBeginning = function () {
    $(this).focusContent(0);
    return this
};
jQuery.fn.keyboardZoomIn = function () {
    $(this).getProject().selectIt("first_child");
    return this
};

function keyboardZoomOut() {
    var a = $(".selected");
    a.is("#workflowy") || a.getParent().selectIt("last_selected")
}
jQuery.fn.keyboardExpandToggle = function () {
    var a = $(this).getProject();
    a.is(".selected") ? a.expandOrCollapseAllDescendantsOfProjectToggle() : a.clickExpandButton();
    return this
};
jQuery.fn.keyboardCollapse = function () {
    var a = $(this).getProject();
    if (a.is(".selected")) {
        var b = a.find(".project.open:visible").getAncestorCounts();
        a = b.maxNumAncestors;
        b = b.numAncestorsToProjectMap;
        if (a !== undefined) {
            a = b[a];
            for (var c in a) a[c].hideChildren("instant").setExpanded(false)
        }
    } else a.is(".task") || !a.is(".open") || a.hideChildren().setExpanded(false)
};
jQuery.fn.keyboardExpand = function () {
    var a = $(this).getProject();
    if (a.is(".selected")) {
        var b = a.find(".project:visible:not(.task):not(.open)").getAncestorCounts();
        a = b.minNumAncestors;
        b = b.numAncestorsToProjectMap;
        if (a !== undefined) {
            a = b[a];
            for (var c in a) a[c].showChildren("instant").setExpanded(true)
        }
    } else a.is(".task") || a.is(".open") || a.showChildren().setExpanded(true)
};
jQuery.fn.getAncestorCounts = function () {
    var a = $(this),
        b = {},
        c = undefined,
        d = undefined;
    a.each(function () {
        var e = $(this),
            f = e.getProjectTreeObjectForProject();
        f = getProjectTreeObjectAncestors(f).length;
        if (f in b) b[f].push(e);
        else b[f] = [e];
        c = c === undefined || f < c ? f : c;
        d = d === undefined || f > d ? f : d
    });
    return {
        numAncestorsToProjectMap: b,
        minNumAncestors: c,
        maxNumAncestors: d
    }
};
jQuery.fn.getCaret = function () {
    var a = this[0];
    if ("selectionStart" in a) {
        var b = a.selectionStart;
        a = a.selectionEnd;
        return b >= 0 ? {
            start: b,
            end: a
        } : {
            start: 0,
            end: 0
        }
    } else if ("createTextRange" in a) {
        a.focus();
        b = document.selection.createRange();
        if (b == null) return {
            start: 0,
            end: 0
        };
        a = a.createTextRange();
        var c = a.duplicate();
        a.moveToBookmark(b.getBookmark());
        c.setEndPoint("EndToStart", a);
        return {
            start: c.text.length,
            end: c.text.length + b.text.length
        }
    } else return {
        start: 0,
        end: 0
    }
};
jQuery.fn.setCaret = function (a, b) {
    if (b === undefined) b = a;
    if (!(ANIMATION_COUNTER.animationsInProgress > 0)) {
        var c = this[0];
        $(c).focusEditorTextArea();
        if (IS_ANDROID) a = b = 0;
        if ("setSelectionRange" in c) c.setSelectionRange(a, b);
        else if ("createTextRange" in c) {
            c = c.createTextRange();
            c.collapse(true);
            c.moveEnd("character", b);
            c.moveStart("character", a);
            c.select()
        }
    }
};

function showMessage(a, b, c) {
    if (b === undefined) b = false;
    var d = $("#message");
    d.removeClass();
    b && d.addClass("errorMessage");
    c != undefined && d.addClass(c);
    d.children(".close").hide();
    d.incrementAnimationCounter().slideDown("normal", function () {
        $(this).find(".close").show();
        ANIMATION_COUNTER.decrement()
    }).find(".messageContent").html(a)
}

function hideMessage() {
    var a = $("#message");
    a.children(".close").hide();
    a.incrementAnimationCounter().slideUp(function () {
        ANIMATION_COUNTER.decrement()
    }).find(".messageContent").html("")
}
jQuery.fn.completeIt = function () {
    var a = $(this);
    if (a.is(".done")) {
        applyLocalOperationAndAddToPendingQueue("uncomplete", {
            projectid: a.attr("projectid")
        });
        IS_MOBILE || a.focusProject()
    } else {
        applyLocalOperationAndAddToPendingQueue("complete", {
            projectid: a.attr("projectid")
        });
        if (shouldShowCompletedProjects()) IS_MOBILE || a.focusProject();
        else {
            a.show();
            setTimeout(function () {
                a.incrementAnimationCounter().slideUp(ANIMATION_SPEEDS.children, function () {
                    $(this).removeAttr("style");
                    ANIMATION_COUNTER.decrement()
                })
            }, 1E3);
            if (a.is(".selected")) setTimeout(function () {
                a.getParent().selectIt()
            }, 500);
            else IS_MOBILE || a.getPreviousProject().children(".name").moveCursorToBeginning()
        }
    }
};
jQuery.fn.deleteIt = function (a) {
    if (a === undefined) a = false;
    var b = $(this),
        c = b.attr("projectid"),
        d = b.getParent();
    if (!a) {
        var e = b.is(".selected"),
            f = b.projectIsEmpty(),
            g = b.getPreviousProject();
        if (g.filter(b).length > 0) g = null
    }
    b = {
        parentid: d.attr("projectid"),
        priority: b.getPriority()
    };
    applyLocalOperationAndAddToPendingQueue("delete", {
        projectid: c
    }, b);
    if (!a) {
        if (e) d.selectIt();
        else g !== null ? g.children(".name").moveCursorToEnd() : blurFocusedTextarea();
        f || showMessage("Item deleted. <a class='undelete' href='#' projectid='" + c + "'>Undo.</a>")
    }
    styleAllEditAreas()
};
jQuery.fn.undeleteIt = function () {
    showMessage("Restoring item...");
    applyLocalOperationAndAddToPendingQueue("undelete", {
        projectid: this.attr("projectid")
    });
    scheduleNextPushOrPoll(true)
};
jQuery.fn.exportIt = function () {
    function a(i, h, n, l, j, k) {
        if (k === undefined) k = true;
        if (k) {
            var m = "nm" in h ? h.nm : "";
            k = "no" in h ? h.no : "";
            var r = "cp" in h ? h.cp : false,
                o = htmlEscapeText(m),
                t = htmlEscapeText(k);
            if (n > 0) b += l + "- ";
            o = $("<span />").addClass("name").html(o);
            if (r) {
                o.addClass("done");
                b += "[COMPLETE] "
            }
            i.append(o);
            b += m + "\n";
            if (n == 0) b += "\n";
            if (k != "") {
                m = $("<div />").addClass("note").html(t);
                i.append(m);
                m = n > 0 ? l + "  " : "";
                k = m + '"' + k.replace(/\n/g, "\n" + m) + '"\n';
                b += k;
                if (n == 0) b += "\n"
            }
        }
        h = getVisibleChildrenOfProjectTreeObject(h, true, j);
        if (h.length > 0) {
            k = $("<ul />");
            n = n + 1;
            l = n > 1 ? l + c : l;
            for (var p in h) {
                m = h[p];
                r = $("<li />");
                a(r, m, n, l, j);
                k.append(r)
            }
            i.append(k)
        }
    }
    var b = "",
        c = "  ",
        d = $(this).getProjectTreeObjectForProject(),
        e = d != null,
        f = $("<div />");
    a(f, d, 0, "", shouldShowCompletedProjects(), e);
    f.append($("<div />").addClass("tagline").html('Created with <a href="http://workflowy.com/">WorkFlowy.com</a>'));
    b += "\n\nCreated with WorkFlowy.com\n";
    d = $("<pre />").text(b);
    e = $("#exportPopup");
    e.html("");
    e.append($("#exportPopupContents").children().clone(true));
    var g = e.children(".previewWindow");
    g.append(f);
    e.children(".textContainer").append(d);
    IS_FIREFOX || g.attr("contenteditable", "true");
    e.dialog("open");
    g.focus();
    selectElementText(g.get()[0])
};

function selectElementText(a, b) {
    b = b || window;
    var c = b.document,
        d;
    if (b.getSelection && c.createRange) {
        d = b.getSelection();
        c = c.createRange();
        c.selectNodeContents(a);
        d.removeAllRanges();
        d.addRange(c)
    } else if (c.body.createTextRange) {
        c = c.body.createTextRange();
        c.moveToElementText(a);
        c.select()
    }
}

function showLoginPopup() {
    closeAllDialogs();
    var a = $("#loginPopup");
    a.append($("#loginPopupContents").children().clone(true));
    a.setDialogButtonsDisable(false);
    a.dialog("open");
    a.find(".loginFormPasswordInput").focus()
}
function hideLoginPopup() {
    var a = $("#loginPopup");
    a.html("");
    a.dialog("close")
}
function closeAllDialogs() {
    $(".ui-dialog > div").dialog("close")
}
jQuery.fn.moveProject = function (a) {
    function b(i) {
        i = i.children(".content");
        var h = i.getEditor();
        h != false && h.is(".fixed") && i.saveContent()
    }
    var c = $(this),
        d = c.attr("projectid"),
        e = c.getParent(),
        f = c.getPriority(),
        g = a.getParent();
    a = a.getPriority();
    a = g[0] == e[0] && a > f ? a - 1 : a;
    b(c.getName());
    b(c.getNotes());
    c = {
        previous_parentid: e.attr("projectid"),
        previous_priority: f
    };
    applyLocalOperationAndAddToPendingQueue("move", {
        projectid: d,
        parentid: g.attr("projectid"),
        priority: a
    }, c);
    return getProjectByProjectId(d)
};

function hideControls() {
    IS_MOBILE ? $("#newControls .panel").removeClass("visible") : $("#newControls").removeClass("hovered");
    $("#hidden").append($("#controls"))
}
jQuery.fn.clearControlsUnderProject = function (a) {
    if (a === undefined) a = false;
    var b = $(this);
    a = a ? b.children(".children") : b;
    b = a.find("#controls");
    b.length == 1 && $("#hidden").append(b);
    (a = a.find("#sortDrop")) && $("#hidden").append(a)
};

function isNewUser() {
    return $("body").hasClass("new_user")
}

function unTap(a) {
    a = $.extend({
        hideEditor: true
    }, a);
    hideControls();
    $(".firstTap").removeClass("firstTap");
    a.hideEditor && $(".editor").hideEditor()
}
function blurFocusedTextarea(a) {
    if (a === undefined) a = null;
    var b = $(document.activeElement);
    if (a !== null) b = b.not(a);
    b.length > 0 && b.is("textarea, input") && b.blur()
}
function editMode() {
    return $("body").hasClass("editMode")
}
jQuery.fn.showSharePopup = function () {
    var a = $(this),
        b = a.getProjectTreeObjectForProject(),
        c = a.attr("projectid"),
        d = $("#sharePopup");
    d.data("projectid", c);
    d.find("input.shareLink").val("http://workflowy.com/shared/" + c + "/");
    d.dialog("option", {
        title: "Share list: " + htmlToText(a.getName().children(".content")).slice(0, 75) + " . . ."
    });
    d.dialog("open");
    updateSharePopupState(d, "shared" in b ? b.shared : null)
};

function updateSharePopupState(a, b) {
    a.removeClass("waiting shared");
    if (b !== null) {
        a.addClass("shared");
        var c = a.find(".is_editable.buttonset");
        c.find(":radio").removeAttr("checked");
        b.write_permission ? a.find("#editable_true").attr("checked", "checked") : a.find("#editable_false").attr("checked", "checked");
        c.buttonset("refresh");
        a.setShareButtons(true);
        a.find("input.shareLink").focus().select()
    } else a.setShareButtons(false)
}
jQuery.fn.setDialogButtonsDisable = function (a) {
    $(this).parent().find("button").button("option", "disabled", a)
};

function shareProject(a, b) {
    var c = getProjectTreeObjectByProjectId(a),
        d = $("#sharePopup");
    d.addClass("waiting");
    d.setDialogButtonsDisable(true);
    addSubtreeExpansionsToPendingDelta(c);
    applyLocalOperationAndAddToPendingQueue("share", {
        projectid: a,
        write_permission: b
    }, {
        previous_shared_info: "shared" in c ? c.shared : null
    });
    scheduleNextPushOrPoll(true)
}

function unshareProject(a) {
    a = getProjectTreeObjectByProjectId(a);
    var b = $("#sharePopup");
    b.addClass("waiting");
    b.setDialogButtonsDisable(true);
    applyLocalOperationAndAddToPendingQueue("unshare", {
        projectid: a.id
    }, {
        previous_shared_info: "shared" in a ? a.shared : null
    });
    scheduleNextPushOrPoll(true)
}

function notifyShareOrUnshareCompleteIfNeeded(a, b) {
    var c = operationQueueContainsOperationType(a, "share"),
        d = operationQueueContainsOperationType(a, "unshare");
    if (c || d) {
        c = $("#sharePopup");
        if (c.is(":visible")) {
            var e = getProjectTreeObjectByProjectId(c.data("projectid"));
            if (b || e === undefined) c.dialog("close");
            else {
                updateSharePopupState(c, "shared" in e ? e.shared : null);
                d && c.dialog("close")
            }
        }
    }
}
function objectIsEmpty(a) {
    for (var b in a) return false;
    return true
}

function showSiteMessageIfNeeded() {
    var a = $("#site_message .message");
    $("body").hasClass("shared") || a.length === 0 || LOCAL_STORAGE_SUPPORTED && a.each(function (b, c) {
        var d = $(c).data("messageid");
        if (localStorage.getItem("msg.closed." + d) === null) {
            $(c).show().addClass("current");
            ANIMATION_COUNTER.increment();
            $("#site_message").slideDown(function () {
                ANIMATION_COUNTER.decrement()
            });
            return false
        }
    })
}
$("#site_message a.popupLink").live("click", function () {
    var a = $(this).closest(".message"),
        b = a.data("popupid");
    a = a.data("popuptitle");
    $("#" + b).dialog({
        width: 520,
        modal: false,
        position: ["center", 80],
        title: a
    });
    return false
});

function closeSiteMessage() {
    if (LOCAL_STORAGE_SUPPORTED) {
        var a = $("#site_message .message.current").data("messageid");
        writeLocalStorage("msg.closed." + a, "1")
    }
    ANIMATION_COUNTER.increment();
    $("#site_message").slideUp(function () {
        ANIMATION_COUNTER.decrement()
    });
    return this
}

function recordAction(a) {
    var b = $(".current.slide:visible").attr("id") || "Normal Usage";
    _gaq.push(["_trackEvent", "Interaction", a.data.type, b]);
    typeof TUTORIAL !== "undefined" && TUTORIAL.recordAction(a)
};
