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

import $ from 'jquery'
import i18next from "i18next";
import { isodateToHuman } from "./util.js"
import { QName } from "./qname.js"
import { Aspect } from "./aspect.js";
import { Period } from './period.js';
import { formatNumber } from "./util.js";
import { Footnote } from "./footnote.js";

export class Fact {
    
    constructor(report, factId) {
        this.f = report.data.facts[factId];
        this.ixNode = report.getIXNodeForItemId(factId);
        this._report = report;
        this.id = factId;
        this.linkedFacts = [];
    }

    report() {
        return this._report;
    }

    getLabel(rolePrefix, withPrefix) {
        return this._report.getLabel(this.f.a.c, rolePrefix, withPrefix);
    }

    getLabelOrName(rolePrefix, withPrefix) {
        return this._report.getLabelOrName(this.f.a.c, rolePrefix, withPrefix);
    }

    conceptName() {
        return this.f.a.c;
    }

    concept() {
        return this._report.getConcept(this.f.a.c); 
    }

    conceptQName() {
        return this._report.qname(this.f.a.c);
    }

    period(){
        return new Period(this.f.a.p);
    }

    periodString() {
        return this.period().toString();
    }


    periodTo() {
        return this.period().to();
    }

    periodFrom() {
        return this.period().from();
    }

    value() {
        return this.f.v;
    }

    readableValue() {
        let v = this.f.v;
        if (this.isInvalidIXValue()) {
            v = "Invalid value";
        }
        else if (this.isNumeric()) {
            const d = this.decimals();
            let formattedNumber;
            if (this.isNil()) {
                formattedNumber = "nil";
            }
            else {
                formattedNumber = formatNumber(v, d);
            }
            if (this.isMonetaryValue()) {
                v = this.unit().valueLabel() + " " + formattedNumber;
            }
            else {
                v = formattedNumber + " " + this.unit().valueLabel();
            }
        }
        else if (this.isNil()) {
            v = "nil";
        }
        else if (this.escaped()) {
            const html = $("<div>").append($($.parseHTML(v, null, false)));
            /* Insert an extra space at the beginning and end of block elements to
             * preserve separation of sections of text. */
            html
                .find("p, td, th, h1, h2, h3, h4, ol, ul, pre, blockquote, dl, div")
                .append(document.createTextNode(' '))
                .prepend(document.createTextNode(' '));
            /* Replace runs of whitespace (including nbsp) with a single space */
            v = html.text().replace(/[\u00a0\s]+/g, " ").trim();
        }
        else if (this.isEnumeration()) {
            const labels = [];
            for (const qn of v.split(' ')) {
                labels.push(this._report.getLabelOrName(qn, 'std'));
            }
            v = labels.join(', ');
        }
        return v;
    }

    unit() {
        if (this.isNumeric()) {
            return this.aspect("u");
        }
        else {
            return undefined;
        }
    }

    isNumeric() {
        return this.f.a.u !== undefined;
    }

    dimensions() {
        const dims = {};
        for (const [k, v] of Object.entries(this.f.a)) {
            if (k.indexOf(":") > -1) {
                dims[k] = v;
            }
        }
        return dims;
    }

    isMonetaryValue() {
        const unit = this.unit();
        if (!unit || unit.value() === null) {
            return false;
        }
        const q = this.report().qname(unit.value());
        return q.namespace == "http://www.xbrl.org/2003/iso4217";
    }

    isTextBlock() {
        return this.concept().isTextBlock();
    }

    aspects() {
        return Object.keys(this.f.a).map(k => this.aspect(k));
    }

    aspect(a) {
        if (this.f.a[a] !== undefined) {
            return new Aspect(a, this.f.a[a], this._report);
        }
        return undefined;
    }

    isAligned(of, coveredAspects) {
        if (Object.keys(this.f.a).length != Object.keys(of.f.a).length) {
            return false;
        }
        for (const a in this.f.a) {
            if (coveredAspects.hasOwnProperty(a)) {
                /* null => accept any value for this aspect */
                if (coveredAspects[a] !== null) {
                    /* if value is an array, it's an array of allowed values */
                    if (coveredAspects[a].constructor === Array) {
                        if (!coveredAspects[a].includes(this.f.a[a])) {
                            return false;
                        }
                    }
                    /* Otherwise a single allowed value */
                    else if (this.f.a[a] != coveredAspects[a]) {
                        return false;
                    }
                }
            }
            else if (this.f.a[a] != of.f.a[a]) {
                return false;
            }
        }
        return true;
    }

    isEquivalentDuration(of) {
        return this.period().isEquivalentDuration(of.period());
    }

    decimals() {
        return this.f.d;
    }

    duplicates() {
        return this._report.getAlignedFacts(this);
    }

    isNil() {
        return this.f.v === null;
    }

    isInvalidIXValue() {
        return this.f.err == 'INVALID_IX_VALUE';
    }

    readableAccuracy() {
        if (!this.isNumeric() || this.isNil()) {
            return i18next.t("common.notApplicable");
        }
        let d = this.decimals();
        if (d === undefined) {
            return i18next.t("common.accuracyInfinite")
        }
        else if (d === null) {
            return i18next.t("common.unspecified");
        }
        var name = i18next.t(`currencies:accuracy${d}`, {defaultValue:"noName"});
        if (this.isMonetaryValue()) {
            var currency = this.report().qname(this.unit().value()).localname;
            if (d == 2) {
                var name = i18next.t(`currencies:cents${currency}`, {defaultValue: name});
            }
        }
        if (name !== "noName") {
            d += " ("+name+")";
        }
        else {
            d += "";
        }
        return d;
    }

    identifier() {
        return this._report.qname(this.f.a.e);
    }

    escaped() {
        return this.ixNode.escaped;
    }

    isEnumeration() {
        return this.concept().isEnumeration();
    }

    footnotes() {
        return (this.f.fn || []).map((fn, i) => this._report.getItemById(fn));
    }

    isHidden() {
        return this.ixNode.isHidden;
    }

    isHTMLHidden() {
        return this.ixNode.htmlHidden;
    }

    widerConcepts() {
        const concepts = [];
        const parentsByELR = this._report.getParentRelationships(this.conceptName(), "w-n");
        for (const elr in parentsByELR) {
            concepts.push(...$.map(parentsByELR[elr], (rel) => rel.src));
        }
        return concepts;
    }

    narrowerConcepts() {
        const concepts = [];
        const childrenByELR = this._report.getChildRelationships(this.conceptName(), "w-n");
        for (const elr in childrenByELR) {
            concepts.push(...$.map(childrenByELR[elr], (rel) => rel.t));
        }
        return concepts;
    }

    // Facts that are the source of relationships to this fact.
    addLinkedFact(f) {
        this.linkedFacts.push(f);
    }
}

