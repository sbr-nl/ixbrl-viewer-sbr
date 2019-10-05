// Copyright 2019 Workiva Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import interact from 'interactjs'
import $ from 'jquery'
import { iXBRLReport } from "./report.js";
import { Viewer } from "./viewer.js";
import { Inspector } from "./inspector.js";

export function iXBRLViewer() {
    this._plugins = [];
    this.inspector = new Inspector(this);
    this.viewer = null;
}

/*
 * Adds a plugin to the viewer.  The plugin should be an object with one or
 * more of the methods listed below, which will be called by the viewer.
 *
 * preProcessiXBRL(bodyElement, docIndex)
 *
 * Called upon viewer intialisation, once for each iXBRL document.  bodyElement
 * is a DOM object for the body element.  docIndex is the index of the document
 * within the document set.
 *
 * updateViewerStyleElement(styleElts)
 *
 * styleElts is a JQuery object consisting of the viewer style elements for
 * each document in the document set.  Additional CSS can be appended to the
 * contents, or additional header elements inserted relative to the provided
 * style element.
 *
 * extendDisplayOptionsMenu(menu)
 *
 * Called when the display options menu is created or recreated.  menu is a
 * Menu object, and can be modified to add additional menu items.
 *
 */
iXBRLViewer.prototype.registerPlugin = function (plugin) {
    this._plugins.push(plugin);
}

iXBRLViewer.prototype.callPluginMethod = function (methodName, ...args) {
    var iv = this;
    $.each(iv._plugins, function (n, p) {
        if (typeof p[methodName] === 'function') {
            p[methodName](...args);
        }
    });
}

iXBRLViewer.prototype._reparentDocument = function () {
    var iframeContainer = $('#ixv #iframe-container');
    
    var iframe = $('<iframe />').appendTo(iframeContainer)[0];

    var doc = iframe.contentDocument || iframe.contentWindow.document;
    doc.open();
    doc.write("<!DOCTYPE html><html><head><title></title></head><body></body></html>");
    doc.close();

    $('head').children().not("script").not("style#ixv-style").appendTo($(iframe).contents().find('head'));
    
    /* Due to self-closing tags, our script tags may not be a direct child of
     * the body tag in an HTML DOM, so move them so that they are */
    $('body script').appendTo($('body'));
    $('body').children().not("script").not('#ixv').not(iframeContainer).appendTo($(iframe).contents().find('body'));

    /* Avoid any inline styles on the old body interfering with the inspector */
    $('body').removeAttr('style');
    return iframe;
}

iXBRLViewer.prototype._getTaxonomyData = function() {
    for (var i = document.body.children.length - 1; i >= 0; i--) {
        var elt = document.body.children[i];
        if (elt.tagName.toUpperCase() == 'SCRIPT' && elt.getAttribute("type") == 'application/x.ixbrl-viewer+json') {
            return elt.innerHTML;
        }
    }
    return null;
}

iXBRLViewer.prototype._checkDocumentSetBrowserSupport = function() {
    if (document.location.protocol == 'file:') {
        alert("Displaying iXBRL document sets from local files is not supported.  Please view the viewer files using a web server.");
    }
}

iXBRLViewer.prototype.load = function() {
    var iv = this;
    var inspector = this.inspector;
    setTimeout(function(){

        var iframes = $(iv._reparentDocument());

        var taxonomyData = iv._getTaxonomyData();
        if (taxonomyData === null) {
            $('#ixv .loader .text').text("Error: Could not find viewer data");
            $('#ixv .loader').removeClass("loading");
            return;
        }
        var report = new iXBRLReport(JSON.parse(taxonomyData));
        if (report.isDocumentSet()) {
            var ds = report.documentSetFiles();
            for (var i = 1; i < ds.length; i++) {
                var iframe = $("<iframe />").attr("src", ds[i]).appendTo("#ixv #iframe-container");
                iframes = iframes.add(iframe);
            }
            iv._checkDocumentSetBrowserSupport();
        }

        /* Poll for iframe load completing - there doesn't seem to be a reliable event that we can use */
        var timer = setInterval(function () {
            var complete = true;
            iframes.each(function (n) {
                var iframe = this;
                var iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                if ((iframeDoc.readyState != 'complete' && iframeDoc.readyState != 'interactive') || $(iframe).contents().find("body").children().length == 0) {
                    complete = false;
                }
            });
            if (complete) {
                clearInterval(timer);
                $('#ixv .loader .text').text("Building search index");

                var viewer = iv.viewer = new Viewer(iv, iframes, report);

                setTimeout(function () {
                    inspector.setReport(report);
                    inspector.setViewer(viewer);

                    interact('#viewer-pane').resizable({
                        edges: { left: false, right: ".resize", bottom: false, top: false},
                        restrictEdges: {
                            outer: 'parent',
                            endOnly: true,
                        },
                        restrictSize: {
                            min: { width: 100 }
                        },
                    })
                    .on('resizestart', function (event) {
                        $('#ixv').css("pointer-events", "none");
                    })
                    .on('resizemove', function (event) {
                        var target = event.target;
                        var w = 100 * event.rect.width / $(target).parent().width();
                        target.style.width = w + '%';
                        $('#inspector').css('width', (100 - w) + '%');
                    })
                    .on('resizeend', function (event) {
                        $('#ixv').css("pointer-events", "auto");
                    });
                    $('#ixv .loader').remove();

                    /* Focus on fact specified in URL fragment, if any */
                    inspector.handleFactDeepLink();
                },0);
            }
        });
    }, 0);
}
