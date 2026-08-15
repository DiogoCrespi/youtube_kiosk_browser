!function(e) {
    var t = {};
    function n(r) {
        if (t[r]) return t[r].exports;
        var o = t[r] = {
            i: r,
            l: !1,
            exports: {}
        };
        return e[r].call(o.exports, o, o.exports, n), o.l = !0, o.exports;
    }
    n.m = e, n.c = t, n.d = function(e, t, r) {
        n.o(e, t) || Object.defineProperty(e, t, {
            enumerable: !0,
            get: r
        });
    }, n.r = function(e) {
        "undefined" != typeof Symbol && Symbol.toStringTag && Object.defineProperty(e, Symbol.toStringTag, {
            value: "Module"
        }), Object.defineProperty(e, "__esModule", {
            value: !0
        });
    }, n.t = function(e, t) {
        if (1 & t && (e = n(e)), 8 & t) return e;
        if (4 & t && "object" == typeof e && e && e.__esModule) return e;
        var r = Object.create(null);
        if (n.r(r), Object.defineProperty(r, "default", {
            enumerable: !0,
            value: e
        }), 2 & t && "string" != typeof e) for (var o in e) n.d(r, o, function(t) {
            return e[t];
        }.bind(null, o));
        return r;
    }, n.n = function(e) {
        var t = e && e.__esModule ? function() {
            return e.default;
        } : function() {
            return e;
        };
        return n.d(t, "a", t), t;
    }, n.o = function(e, t) {
        return Object.prototype.hasOwnProperty.call(e, t);
    }, n.p = "", n(n.s = 57);
}({
    12: function(e, t, n) {
        var r = n(7).default, o = n(15);
        e.exports = function(e) {
            var t = o(e, "string");
            return "symbol" == r(t) ? t : t + "";
        }, e.exports.__esModule = !0, e.exports.default = e.exports;
    },
    15: function(e, t, n) {
        var r = n(7).default;
        e.exports = function(e, t) {
            if ("object" != r(e) || !e) return e;
            var n = e[Symbol.toPrimitive];
            if (void 0 !== n) {
                var o = n.call(e, t || "default");
                if ("object" != r(o)) return o;
                throw new TypeError("@@toPrimitive must return a primitive value.");
            }
            return ("string" === t ? String : Number)(e);
        }, e.exports.__esModule = !0, e.exports.default = e.exports;
    },
    2: function(e, t) {
        e.exports = function(e, t) {
            if (!(e instanceof t)) throw new TypeError("Cannot call a class as a function");
        }, e.exports.__esModule = !0, e.exports.default = e.exports;
    },
    3: function(e, t, n) {
        var r = n(12);
        function o(e, t) {
            for (var n = 0; n < t.length; n++) {
                var o = t[n];
                o.enumerable = o.enumerable || !1, o.configurable = !0, "value" in o && (o.writable = !0), 
                Object.defineProperty(e, r(o.key), o);
            }
        }
        e.exports = function(e, t, n) {
            return t && o(e.prototype, t), n && o(e, n), Object.defineProperty(e, "prototype", {
                writable: !1
            }), e;
        }, e.exports.__esModule = !0, e.exports.default = e.exports;
    },
    57: function(e, t, n) {
        "use strict";
        n.r(t);
        var r = n(2), o = n.n(r), i = n(3);
        new (n.n(i)()((function e() {
            o()(this, e), this.run();
        }), [ {
            key: "run",
            value: function() {
                var e = this;
                if (window.pip) return document.exitPictureInPicture(), void (window.pip = !1);
                if (documentPictureInPicture.window) documentPictureInPicture.window.close(); else {
                    var t = this.getVideoNode();
                    if (!t) return;
                    var n = t.parentElement;
                    documentPictureInPicture.requestWindow({
                        width: 400,
                        height: 225
                    }).then((function(r) {
                        e.addWindowControls(r.document.body, t);
                        var o = r.document.createElement("div");
                        o.classList.add("video-wrapper"), r.document.body.append(o), r.document.body.setAttribute("hostname", document.location.hostname), 
                        o.append(t), r.addEventListener("pagehide", (function(e) {
                            var t = e.target.querySelector("video");
                            n && (n.append(t), n = null);
                            var r = document.querySelector(".html5-video-player"), o = e.target.querySelector(".ytp-caption-window-container");
                            o && r.append(o);
                        })), r.addEventListener("message", (function(t) {
                            if (t.source === r && t.data && "pip-extension" === t.data.source) switch (t.data.action) {
                              case "NEXT_VIDEO":
                                e.next();
                            }
                        }));
                    })).catch((function(e) {
                        window.postMessage({
                            source: "pip-extension",
                            action: "WINDOW_ERROR"
                        }, "*");
                    }));
                }
            }
        }, {
            key: "getVideoNode",
            value: function() {
                var e = Array.from(document.querySelectorAll("video")).filter((function(e) {
                    return 0 !== e.readyState;
                })).sort((function(e, t) {
                    var n = e.getClientRects()[0] || {
                        width: 0,
                        height: 0
                    }, r = t.getClientRects()[0] || {
                        width: 0,
                        height: 0
                    };
                    return r.width * r.height - n.width * n.height;
                }));
                if (0 !== e.length) return e[0];
            }
        }, {
            key: "addWindowControls",
            value: function(e, t) {
                var n = document.createElement("div");
                n.id = "controls-container-99861402-994e-4967-9f5e-27f9803f3a86", e.appendChild(n);
            }
        }, {
            key: "next",
            value: function() {
                var e = document.querySelector(".ytp-next-button.ytp-button");
                e && e.click();
            }
        } ]));
    },
    7: function(e, t) {
        function n(t) {
            return e.exports = n = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function(e) {
                return typeof e;
            } : function(e) {
                return e && "function" == typeof Symbol && e.constructor === Symbol && e !== Symbol.prototype ? "symbol" : typeof e;
            }, e.exports.__esModule = !0, e.exports.default = e.exports, n(t);
        }
        e.exports = n, e.exports.__esModule = !0, e.exports.default = e.exports;
    }
});