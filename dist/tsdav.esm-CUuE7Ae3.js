import { a as __require, s as __toESM, t as __commonJSMin } from "./chunk-iyeSoAlh.js";
import { t as require_src } from "./src-Fh_wi_S3.js";
//#region node_modules/sax/lib/sax.js
var require_sax = /* @__PURE__ */ __commonJSMin(((exports) => {
	(function(sax) {
		sax.parser = function(strict, opt) {
			return new SAXParser(strict, opt);
		};
		sax.SAXParser = SAXParser;
		sax.SAXStream = SAXStream;
		sax.createStream = createStream;
		sax.MAX_BUFFER_LENGTH = 64 * 1024;
		var buffers = [
			"comment",
			"sgmlDecl",
			"textNode",
			"tagName",
			"doctype",
			"procInstName",
			"procInstBody",
			"entity",
			"attribName",
			"attribValue",
			"cdata",
			"script"
		];
		sax.EVENTS = [
			"text",
			"processinginstruction",
			"sgmldeclaration",
			"doctype",
			"comment",
			"opentagstart",
			"attribute",
			"opentag",
			"closetag",
			"opencdata",
			"cdata",
			"closecdata",
			"error",
			"end",
			"ready",
			"script",
			"opennamespace",
			"closenamespace"
		];
		function SAXParser(strict, opt) {
			if (!(this instanceof SAXParser)) return new SAXParser(strict, opt);
			var parser = this;
			clearBuffers(parser);
			parser.q = parser.c = "";
			parser.bufferCheckPosition = sax.MAX_BUFFER_LENGTH;
			parser.encoding = null;
			parser.opt = opt || {};
			parser.opt.lowercase = parser.opt.lowercase || parser.opt.lowercasetags;
			parser.looseCase = parser.opt.lowercase ? "toLowerCase" : "toUpperCase";
			parser.opt.maxEntityCount = parser.opt.maxEntityCount || 512;
			parser.opt.maxEntityDepth = parser.opt.maxEntityDepth || 4;
			parser.entityCount = parser.entityDepth = 0;
			parser.tags = [];
			parser.closed = parser.closedRoot = parser.sawRoot = false;
			parser.tag = parser.error = null;
			parser.strict = !!strict;
			parser.noscript = !!(strict || parser.opt.noscript);
			parser.state = S.BEGIN;
			parser.strictEntities = parser.opt.strictEntities;
			parser.ENTITIES = parser.strictEntities ? Object.create(sax.XML_ENTITIES) : Object.create(sax.ENTITIES);
			parser.attribList = [];
			if (parser.opt.xmlns) parser.ns = Object.create(rootNS);
			if (parser.opt.unquotedAttributeValues === void 0) parser.opt.unquotedAttributeValues = !strict;
			parser.trackPosition = parser.opt.position !== false;
			if (parser.trackPosition) parser.position = parser.line = parser.column = 0;
			emit(parser, "onready");
		}
		if (!Object.create) Object.create = function(o) {
			function F() {}
			F.prototype = o;
			return new F();
		};
		if (!Object.keys) Object.keys = function(o) {
			var a = [];
			for (var i in o) if (o.hasOwnProperty(i)) a.push(i);
			return a;
		};
		function checkBufferLength(parser) {
			var maxAllowed = Math.max(sax.MAX_BUFFER_LENGTH, 10);
			var maxActual = 0;
			for (var i = 0, l = buffers.length; i < l; i++) {
				var len = parser[buffers[i]].length;
				if (len > maxAllowed) switch (buffers[i]) {
					case "textNode":
						closeText(parser);
						break;
					case "cdata":
						emitNode(parser, "oncdata", parser.cdata);
						parser.cdata = "";
						break;
					case "script":
						emitNode(parser, "onscript", parser.script);
						parser.script = "";
						break;
					default: error(parser, "Max buffer length exceeded: " + buffers[i]);
				}
				maxActual = Math.max(maxActual, len);
			}
			parser.bufferCheckPosition = sax.MAX_BUFFER_LENGTH - maxActual + parser.position;
		}
		function clearBuffers(parser) {
			for (var i = 0, l = buffers.length; i < l; i++) parser[buffers[i]] = "";
		}
		function flushBuffers(parser) {
			closeText(parser);
			if (parser.cdata !== "") {
				emitNode(parser, "oncdata", parser.cdata);
				parser.cdata = "";
			}
			if (parser.script !== "") {
				emitNode(parser, "onscript", parser.script);
				parser.script = "";
			}
		}
		SAXParser.prototype = {
			end: function() {
				end(this);
			},
			write,
			resume: function() {
				this.error = null;
				return this;
			},
			close: function() {
				return this.write(null);
			},
			flush: function() {
				flushBuffers(this);
			}
		};
		var Stream;
		try {
			Stream = __require("stream").Stream;
		} catch (ex) {
			Stream = function() {};
		}
		if (!Stream) Stream = function() {};
		var streamWraps = sax.EVENTS.filter(function(ev) {
			return ev !== "error" && ev !== "end";
		});
		function createStream(strict, opt) {
			return new SAXStream(strict, opt);
		}
		function determineBufferEncoding(data, isEnd) {
			if (data.length >= 2) {
				if (data[0] === 255 && data[1] === 254) return "utf-16le";
				if (data[0] === 254 && data[1] === 255) return "utf-16be";
			}
			if (data.length >= 3 && data[0] === 239 && data[1] === 187 && data[2] === 191) return "utf8";
			if (data.length >= 4) {
				if (data[0] === 60 && data[1] === 0 && data[2] === 63 && data[3] === 0) return "utf-16le";
				if (data[0] === 0 && data[1] === 60 && data[2] === 0 && data[3] === 63) return "utf-16be";
				return "utf8";
			}
			return isEnd ? "utf8" : null;
		}
		function SAXStream(strict, opt) {
			if (!(this instanceof SAXStream)) return new SAXStream(strict, opt);
			Stream.apply(this);
			this._parser = new SAXParser(strict, opt);
			this.writable = true;
			this.readable = true;
			var me = this;
			this._parser.onend = function() {
				me.emit("end");
			};
			this._parser.onerror = function(er) {
				me.emit("error", er);
				me._parser.error = null;
			};
			this._decoder = null;
			this._decoderBuffer = null;
			streamWraps.forEach(function(ev) {
				Object.defineProperty(me, "on" + ev, {
					get: function() {
						return me._parser["on" + ev];
					},
					set: function(h) {
						if (!h) {
							me.removeAllListeners(ev);
							me._parser["on" + ev] = h;
							return h;
						}
						me.on(ev, h);
					},
					enumerable: true,
					configurable: false
				});
			});
		}
		SAXStream.prototype = Object.create(Stream.prototype, { constructor: { value: SAXStream } });
		SAXStream.prototype._decodeBuffer = function(data, isEnd) {
			if (this._decoderBuffer) {
				data = Buffer.concat([this._decoderBuffer, data]);
				this._decoderBuffer = null;
			}
			if (!this._decoder) {
				var encoding = determineBufferEncoding(data, isEnd);
				if (!encoding) {
					this._decoderBuffer = data;
					return "";
				}
				this._parser.encoding = encoding;
				this._decoder = new TextDecoder(encoding);
			}
			return this._decoder.decode(data, { stream: !isEnd });
		};
		SAXStream.prototype.write = function(data) {
			if (typeof Buffer === "function" && typeof Buffer.isBuffer === "function" && Buffer.isBuffer(data)) data = this._decodeBuffer(data, false);
			else if (this._decoderBuffer) {
				var remaining = this._decodeBuffer(Buffer.alloc(0), true);
				if (remaining) {
					this._parser.write(remaining);
					this.emit("data", remaining);
				}
			}
			this._parser.write(data.toString());
			this.emit("data", data);
			return true;
		};
		SAXStream.prototype.end = function(chunk) {
			if (chunk && chunk.length) this.write(chunk);
			if (this._decoderBuffer) {
				var finalChunk = this._decodeBuffer(Buffer.alloc(0), true);
				if (finalChunk) {
					this._parser.write(finalChunk);
					this.emit("data", finalChunk);
				}
			} else if (this._decoder) {
				var remaining = this._decoder.decode();
				if (remaining) {
					this._parser.write(remaining);
					this.emit("data", remaining);
				}
			}
			this._parser.end();
			return true;
		};
		SAXStream.prototype.on = function(ev, handler) {
			var me = this;
			if (!me._parser["on" + ev] && streamWraps.indexOf(ev) !== -1) me._parser["on" + ev] = function() {
				var args = arguments.length === 1 ? [arguments[0]] : Array.apply(null, arguments);
				args.splice(0, 0, ev);
				me.emit.apply(me, args);
			};
			return Stream.prototype.on.call(me, ev, handler);
		};
		var CDATA = "[CDATA[";
		var DOCTYPE = "DOCTYPE";
		var XML_NAMESPACE = "http://www.w3.org/XML/1998/namespace";
		var XMLNS_NAMESPACE = "http://www.w3.org/2000/xmlns/";
		var rootNS = {
			xml: XML_NAMESPACE,
			xmlns: XMLNS_NAMESPACE
		};
		var nameStart = /[:_A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD]/;
		var nameBody = /[:_A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD\u00B7\u0300-\u036F\u203F-\u2040.\d-]/;
		var entityStart = /[#:_A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD]/;
		var entityBody = /[#:_A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD\u00B7\u0300-\u036F\u203F-\u2040.\d-]/;
		function isWhitespace(c) {
			return c === " " || c === "\n" || c === "\r" || c === "	";
		}
		function isQuote(c) {
			return c === "\"" || c === "'";
		}
		function isAttribEnd(c) {
			return c === ">" || isWhitespace(c);
		}
		function isMatch(regex, c) {
			return regex.test(c);
		}
		function notMatch(regex, c) {
			return !isMatch(regex, c);
		}
		var S = 0;
		sax.STATE = {
			BEGIN: S++,
			BEGIN_WHITESPACE: S++,
			TEXT: S++,
			TEXT_ENTITY: S++,
			OPEN_WAKA: S++,
			SGML_DECL: S++,
			SGML_DECL_QUOTED: S++,
			DOCTYPE: S++,
			DOCTYPE_QUOTED: S++,
			DOCTYPE_DTD: S++,
			DOCTYPE_DTD_QUOTED: S++,
			COMMENT_STARTING: S++,
			COMMENT: S++,
			COMMENT_ENDING: S++,
			COMMENT_ENDED: S++,
			CDATA: S++,
			CDATA_ENDING: S++,
			CDATA_ENDING_2: S++,
			PROC_INST: S++,
			PROC_INST_BODY: S++,
			PROC_INST_ENDING: S++,
			OPEN_TAG: S++,
			OPEN_TAG_SLASH: S++,
			ATTRIB: S++,
			ATTRIB_NAME: S++,
			ATTRIB_NAME_SAW_WHITE: S++,
			ATTRIB_VALUE: S++,
			ATTRIB_VALUE_QUOTED: S++,
			ATTRIB_VALUE_CLOSED: S++,
			ATTRIB_VALUE_UNQUOTED: S++,
			ATTRIB_VALUE_ENTITY_Q: S++,
			ATTRIB_VALUE_ENTITY_U: S++,
			CLOSE_TAG: S++,
			CLOSE_TAG_SAW_WHITE: S++,
			SCRIPT: S++,
			SCRIPT_ENDING: S++
		};
		sax.XML_ENTITIES = {
			amp: "&",
			gt: ">",
			lt: "<",
			quot: "\"",
			apos: "'"
		};
		sax.ENTITIES = {
			amp: "&",
			gt: ">",
			lt: "<",
			quot: "\"",
			apos: "'",
			AElig: 198,
			Aacute: 193,
			Acirc: 194,
			Agrave: 192,
			Aring: 197,
			Atilde: 195,
			Auml: 196,
			Ccedil: 199,
			ETH: 208,
			Eacute: 201,
			Ecirc: 202,
			Egrave: 200,
			Euml: 203,
			Iacute: 205,
			Icirc: 206,
			Igrave: 204,
			Iuml: 207,
			Ntilde: 209,
			Oacute: 211,
			Ocirc: 212,
			Ograve: 210,
			Oslash: 216,
			Otilde: 213,
			Ouml: 214,
			THORN: 222,
			Uacute: 218,
			Ucirc: 219,
			Ugrave: 217,
			Uuml: 220,
			Yacute: 221,
			aacute: 225,
			acirc: 226,
			aelig: 230,
			agrave: 224,
			aring: 229,
			atilde: 227,
			auml: 228,
			ccedil: 231,
			eacute: 233,
			ecirc: 234,
			egrave: 232,
			eth: 240,
			euml: 235,
			iacute: 237,
			icirc: 238,
			igrave: 236,
			iuml: 239,
			ntilde: 241,
			oacute: 243,
			ocirc: 244,
			ograve: 242,
			oslash: 248,
			otilde: 245,
			ouml: 246,
			szlig: 223,
			thorn: 254,
			uacute: 250,
			ucirc: 251,
			ugrave: 249,
			uuml: 252,
			yacute: 253,
			yuml: 255,
			copy: 169,
			reg: 174,
			nbsp: 160,
			iexcl: 161,
			cent: 162,
			pound: 163,
			curren: 164,
			yen: 165,
			brvbar: 166,
			sect: 167,
			uml: 168,
			ordf: 170,
			laquo: 171,
			not: 172,
			shy: 173,
			macr: 175,
			deg: 176,
			plusmn: 177,
			sup1: 185,
			sup2: 178,
			sup3: 179,
			acute: 180,
			micro: 181,
			para: 182,
			middot: 183,
			cedil: 184,
			ordm: 186,
			raquo: 187,
			frac14: 188,
			frac12: 189,
			frac34: 190,
			iquest: 191,
			times: 215,
			divide: 247,
			OElig: 338,
			oelig: 339,
			Scaron: 352,
			scaron: 353,
			Yuml: 376,
			fnof: 402,
			circ: 710,
			tilde: 732,
			Alpha: 913,
			Beta: 914,
			Gamma: 915,
			Delta: 916,
			Epsilon: 917,
			Zeta: 918,
			Eta: 919,
			Theta: 920,
			Iota: 921,
			Kappa: 922,
			Lambda: 923,
			Mu: 924,
			Nu: 925,
			Xi: 926,
			Omicron: 927,
			Pi: 928,
			Rho: 929,
			Sigma: 931,
			Tau: 932,
			Upsilon: 933,
			Phi: 934,
			Chi: 935,
			Psi: 936,
			Omega: 937,
			alpha: 945,
			beta: 946,
			gamma: 947,
			delta: 948,
			epsilon: 949,
			zeta: 950,
			eta: 951,
			theta: 952,
			iota: 953,
			kappa: 954,
			lambda: 955,
			mu: 956,
			nu: 957,
			xi: 958,
			omicron: 959,
			pi: 960,
			rho: 961,
			sigmaf: 962,
			sigma: 963,
			tau: 964,
			upsilon: 965,
			phi: 966,
			chi: 967,
			psi: 968,
			omega: 969,
			thetasym: 977,
			upsih: 978,
			piv: 982,
			ensp: 8194,
			emsp: 8195,
			thinsp: 8201,
			zwnj: 8204,
			zwj: 8205,
			lrm: 8206,
			rlm: 8207,
			ndash: 8211,
			mdash: 8212,
			lsquo: 8216,
			rsquo: 8217,
			sbquo: 8218,
			ldquo: 8220,
			rdquo: 8221,
			bdquo: 8222,
			dagger: 8224,
			Dagger: 8225,
			bull: 8226,
			hellip: 8230,
			permil: 8240,
			prime: 8242,
			Prime: 8243,
			lsaquo: 8249,
			rsaquo: 8250,
			oline: 8254,
			frasl: 8260,
			euro: 8364,
			image: 8465,
			weierp: 8472,
			real: 8476,
			trade: 8482,
			alefsym: 8501,
			larr: 8592,
			uarr: 8593,
			rarr: 8594,
			darr: 8595,
			harr: 8596,
			crarr: 8629,
			lArr: 8656,
			uArr: 8657,
			rArr: 8658,
			dArr: 8659,
			hArr: 8660,
			forall: 8704,
			part: 8706,
			exist: 8707,
			empty: 8709,
			nabla: 8711,
			isin: 8712,
			notin: 8713,
			ni: 8715,
			prod: 8719,
			sum: 8721,
			minus: 8722,
			lowast: 8727,
			radic: 8730,
			prop: 8733,
			infin: 8734,
			ang: 8736,
			and: 8743,
			or: 8744,
			cap: 8745,
			cup: 8746,
			int: 8747,
			there4: 8756,
			sim: 8764,
			cong: 8773,
			asymp: 8776,
			ne: 8800,
			equiv: 8801,
			le: 8804,
			ge: 8805,
			sub: 8834,
			sup: 8835,
			nsub: 8836,
			sube: 8838,
			supe: 8839,
			oplus: 8853,
			otimes: 8855,
			perp: 8869,
			sdot: 8901,
			lceil: 8968,
			rceil: 8969,
			lfloor: 8970,
			rfloor: 8971,
			lang: 9001,
			rang: 9002,
			loz: 9674,
			spades: 9824,
			clubs: 9827,
			hearts: 9829,
			diams: 9830
		};
		Object.keys(sax.ENTITIES).forEach(function(key) {
			var e = sax.ENTITIES[key];
			var s = typeof e === "number" ? String.fromCharCode(e) : e;
			sax.ENTITIES[key] = s;
		});
		for (var s in sax.STATE) sax.STATE[sax.STATE[s]] = s;
		S = sax.STATE;
		function emit(parser, event, data) {
			parser[event] && parser[event](data);
		}
		function getDeclaredEncoding(body) {
			var match = body && body.match(/(?:^|\s)encoding\s*=\s*(['"])([^'"]+)\1/i);
			return match ? match[2] : null;
		}
		function normalizeEncodingName(encoding) {
			if (!encoding) return null;
			return encoding.toLowerCase().replace(/[^a-z0-9]/g, "");
		}
		function encodingsMatch(detectedEncoding, declaredEncoding) {
			const detected = normalizeEncodingName(detectedEncoding);
			const declared = normalizeEncodingName(declaredEncoding);
			if (!detected || !declared) return true;
			if (declared === "utf16") return detected === "utf16le" || detected === "utf16be";
			return detected === declared;
		}
		function validateXmlDeclarationEncoding(parser, data) {
			if (!parser.strict || !parser.encoding || !data || data.name !== "xml") return;
			var declaredEncoding = getDeclaredEncoding(data.body);
			if (declaredEncoding && !encodingsMatch(parser.encoding, declaredEncoding)) strictFail(parser, "XML declaration encoding " + declaredEncoding + " does not match detected stream encoding " + parser.encoding.toUpperCase());
		}
		function emitNode(parser, nodeType, data) {
			if (parser.textNode) closeText(parser);
			emit(parser, nodeType, data);
		}
		function closeText(parser) {
			parser.textNode = textopts(parser.opt, parser.textNode);
			if (parser.textNode) emit(parser, "ontext", parser.textNode);
			parser.textNode = "";
		}
		function textopts(opt, text) {
			if (opt.trim) text = text.trim();
			if (opt.normalize) text = text.replace(/\s+/g, " ");
			return text;
		}
		function error(parser, er) {
			closeText(parser);
			if (parser.trackPosition) er += "\nLine: " + parser.line + "\nColumn: " + parser.column + "\nChar: " + parser.c;
			er = new Error(er);
			parser.error = er;
			emit(parser, "onerror", er);
			return parser;
		}
		function end(parser) {
			if (parser.sawRoot && !parser.closedRoot) strictFail(parser, "Unclosed root tag");
			if (parser.state !== S.BEGIN && parser.state !== S.BEGIN_WHITESPACE && parser.state !== S.TEXT) error(parser, "Unexpected end");
			closeText(parser);
			parser.c = "";
			parser.closed = true;
			emit(parser, "onend");
			SAXParser.call(parser, parser.strict, parser.opt);
			return parser;
		}
		function strictFail(parser, message) {
			if (typeof parser !== "object" || !(parser instanceof SAXParser)) throw new Error("bad call to strictFail");
			if (parser.strict) error(parser, message);
		}
		function newTag(parser) {
			if (!parser.strict) parser.tagName = parser.tagName[parser.looseCase]();
			var parent = parser.tags[parser.tags.length - 1] || parser;
			var tag = parser.tag = {
				name: parser.tagName,
				attributes: {}
			};
			if (parser.opt.xmlns) tag.ns = parent.ns;
			parser.attribList.length = 0;
			emitNode(parser, "onopentagstart", tag);
		}
		function qname(name, attribute) {
			var qualName = name.indexOf(":") < 0 ? ["", name] : name.split(":");
			var prefix = qualName[0];
			var local = qualName[1];
			if (attribute && name === "xmlns") {
				prefix = "xmlns";
				local = "";
			}
			return {
				prefix,
				local
			};
		}
		function attrib(parser) {
			if (!parser.strict) parser.attribName = parser.attribName[parser.looseCase]();
			if (parser.attribList.indexOf(parser.attribName) !== -1 || parser.tag.attributes.hasOwnProperty(parser.attribName)) {
				parser.attribName = parser.attribValue = "";
				return;
			}
			if (parser.opt.xmlns) {
				var qn = qname(parser.attribName, true);
				var prefix = qn.prefix;
				var local = qn.local;
				if (prefix === "xmlns") if (local === "xml" && parser.attribValue !== XML_NAMESPACE) strictFail(parser, "xml: prefix must be bound to " + XML_NAMESPACE + "\nActual: " + parser.attribValue);
				else if (local === "xmlns" && parser.attribValue !== XMLNS_NAMESPACE) strictFail(parser, "xmlns: prefix must be bound to " + XMLNS_NAMESPACE + "\nActual: " + parser.attribValue);
				else {
					var tag = parser.tag;
					var parent = parser.tags[parser.tags.length - 1] || parser;
					if (tag.ns === parent.ns) tag.ns = Object.create(parent.ns);
					tag.ns[local] = parser.attribValue;
				}
				parser.attribList.push([parser.attribName, parser.attribValue]);
			} else {
				parser.tag.attributes[parser.attribName] = parser.attribValue;
				emitNode(parser, "onattribute", {
					name: parser.attribName,
					value: parser.attribValue
				});
			}
			parser.attribName = parser.attribValue = "";
		}
		function openTag(parser, selfClosing) {
			if (parser.opt.xmlns) {
				var tag = parser.tag;
				var qn = qname(parser.tagName);
				tag.prefix = qn.prefix;
				tag.local = qn.local;
				tag.uri = tag.ns[qn.prefix] || "";
				if (tag.prefix && !tag.uri) {
					strictFail(parser, "Unbound namespace prefix: " + JSON.stringify(parser.tagName));
					tag.uri = qn.prefix;
				}
				var parent = parser.tags[parser.tags.length - 1] || parser;
				if (tag.ns && parent.ns !== tag.ns) Object.keys(tag.ns).forEach(function(p) {
					emitNode(parser, "onopennamespace", {
						prefix: p,
						uri: tag.ns[p]
					});
				});
				for (var i = 0, l = parser.attribList.length; i < l; i++) {
					var nv = parser.attribList[i];
					var name = nv[0];
					var value = nv[1];
					var qualName = qname(name, true);
					var prefix = qualName.prefix;
					var local = qualName.local;
					var uri = prefix === "" ? "" : tag.ns[prefix] || "";
					var a = {
						name,
						value,
						prefix,
						local,
						uri
					};
					if (prefix && prefix !== "xmlns" && !uri) {
						strictFail(parser, "Unbound namespace prefix: " + JSON.stringify(prefix));
						a.uri = prefix;
					}
					parser.tag.attributes[name] = a;
					emitNode(parser, "onattribute", a);
				}
				parser.attribList.length = 0;
			}
			parser.tag.isSelfClosing = !!selfClosing;
			parser.sawRoot = true;
			parser.tags.push(parser.tag);
			emitNode(parser, "onopentag", parser.tag);
			if (!selfClosing) {
				if (!parser.noscript && parser.tagName.toLowerCase() === "script") parser.state = S.SCRIPT;
				else parser.state = S.TEXT;
				parser.tag = null;
				parser.tagName = "";
			}
			parser.attribName = parser.attribValue = "";
			parser.attribList.length = 0;
		}
		function closeTag(parser) {
			if (!parser.tagName) {
				strictFail(parser, "Weird empty close tag.");
				parser.textNode += "</>";
				parser.state = S.TEXT;
				return;
			}
			if (parser.script) {
				if (parser.tagName !== "script") {
					parser.script += "</" + parser.tagName + ">";
					parser.tagName = "";
					parser.state = S.SCRIPT;
					return;
				}
				emitNode(parser, "onscript", parser.script);
				parser.script = "";
			}
			var t = parser.tags.length;
			var tagName = parser.tagName;
			if (!parser.strict) tagName = tagName[parser.looseCase]();
			var closeTo = tagName;
			while (t--) if (parser.tags[t].name !== closeTo) strictFail(parser, "Unexpected close tag");
			else break;
			if (t < 0) {
				strictFail(parser, "Unmatched closing tag: " + parser.tagName);
				parser.textNode += "</" + parser.tagName + ">";
				parser.state = S.TEXT;
				return;
			}
			parser.tagName = tagName;
			var s = parser.tags.length;
			while (s-- > t) {
				var tag = parser.tag = parser.tags.pop();
				parser.tagName = parser.tag.name;
				emitNode(parser, "onclosetag", parser.tagName);
				var x = {};
				for (var i in tag.ns) x[i] = tag.ns[i];
				var parent = parser.tags[parser.tags.length - 1] || parser;
				if (parser.opt.xmlns && tag.ns !== parent.ns) Object.keys(tag.ns).forEach(function(p) {
					var n = tag.ns[p];
					emitNode(parser, "onclosenamespace", {
						prefix: p,
						uri: n
					});
				});
			}
			if (t === 0) parser.closedRoot = true;
			parser.tagName = parser.attribValue = parser.attribName = "";
			parser.attribList.length = 0;
			parser.state = S.TEXT;
		}
		function parseEntity(parser) {
			var entity = parser.entity;
			var entityLC = entity.toLowerCase();
			var num;
			var numStr = "";
			if (parser.ENTITIES[entity]) return parser.ENTITIES[entity];
			if (parser.ENTITIES[entityLC]) return parser.ENTITIES[entityLC];
			entity = entityLC;
			if (entity.charAt(0) === "#") if (entity.charAt(1) === "x") {
				entity = entity.slice(2);
				num = parseInt(entity, 16);
				numStr = num.toString(16);
			} else {
				entity = entity.slice(1);
				num = parseInt(entity, 10);
				numStr = num.toString(10);
			}
			entity = entity.replace(/^0+/, "");
			if (isNaN(num) || numStr.toLowerCase() !== entity || num < 0 || num > 1114111) {
				strictFail(parser, "Invalid character entity");
				return "&" + parser.entity + ";";
			}
			return String.fromCodePoint(num);
		}
		function beginWhiteSpace(parser, c) {
			if (c === "<") {
				parser.state = S.OPEN_WAKA;
				parser.startTagPosition = parser.position;
			} else if (!isWhitespace(c)) {
				strictFail(parser, "Non-whitespace before first tag.");
				parser.textNode = c;
				parser.state = S.TEXT;
			}
		}
		function charAt(chunk, i) {
			var result = "";
			if (i < chunk.length) result = chunk.charAt(i);
			return result;
		}
		function write(chunk) {
			var parser = this;
			if (this.error) throw this.error;
			if (parser.closed) return error(parser, "Cannot write after close. Assign an onready handler.");
			if (chunk === null) return end(parser);
			if (typeof chunk === "object") chunk = chunk.toString();
			var i = 0;
			var c = "";
			while (true) {
				c = charAt(chunk, i++);
				parser.c = c;
				if (!c) break;
				if (parser.trackPosition) {
					parser.position++;
					if (c === "\n") {
						parser.line++;
						parser.column = 0;
					} else parser.column++;
				}
				switch (parser.state) {
					case S.BEGIN:
						parser.state = S.BEGIN_WHITESPACE;
						if (c === "﻿") continue;
						beginWhiteSpace(parser, c);
						continue;
					case S.BEGIN_WHITESPACE:
						beginWhiteSpace(parser, c);
						continue;
					case S.TEXT:
						if (parser.sawRoot && !parser.closedRoot) {
							var starti = i - 1;
							while (c && c !== "<" && c !== "&") {
								c = charAt(chunk, i++);
								if (c && parser.trackPosition) {
									parser.position++;
									if (c === "\n") {
										parser.line++;
										parser.column = 0;
									} else parser.column++;
								}
							}
							parser.textNode += chunk.substring(starti, i - 1);
						}
						if (c === "<" && !(parser.sawRoot && parser.closedRoot && !parser.strict)) {
							parser.state = S.OPEN_WAKA;
							parser.startTagPosition = parser.position;
						} else {
							if (!isWhitespace(c) && (!parser.sawRoot || parser.closedRoot)) strictFail(parser, "Text data outside of root node.");
							if (c === "&") parser.state = S.TEXT_ENTITY;
							else parser.textNode += c;
						}
						continue;
					case S.SCRIPT:
						if (c === "<") parser.state = S.SCRIPT_ENDING;
						else parser.script += c;
						continue;
					case S.SCRIPT_ENDING:
						if (c === "/") parser.state = S.CLOSE_TAG;
						else {
							parser.script += "<" + c;
							parser.state = S.SCRIPT;
						}
						continue;
					case S.OPEN_WAKA:
						if (c === "!") {
							parser.state = S.SGML_DECL;
							parser.sgmlDecl = "";
						} else if (isWhitespace(c)) {} else if (isMatch(nameStart, c)) {
							parser.state = S.OPEN_TAG;
							parser.tagName = c;
						} else if (c === "/") {
							parser.state = S.CLOSE_TAG;
							parser.tagName = "";
						} else if (c === "?") {
							parser.state = S.PROC_INST;
							parser.procInstName = parser.procInstBody = "";
						} else {
							strictFail(parser, "Unencoded <");
							if (parser.startTagPosition + 1 < parser.position) {
								var pad = parser.position - parser.startTagPosition;
								c = new Array(pad).join(" ") + c;
							}
							parser.textNode += "<" + c;
							parser.state = S.TEXT;
						}
						continue;
					case S.SGML_DECL:
						if (parser.sgmlDecl + c === "--") {
							parser.state = S.COMMENT;
							parser.comment = "";
							parser.sgmlDecl = "";
							continue;
						}
						if (parser.doctype && parser.doctype !== true && parser.sgmlDecl) {
							parser.state = S.DOCTYPE_DTD;
							parser.doctype += "<!" + parser.sgmlDecl + c;
							parser.sgmlDecl = "";
						} else if ((parser.sgmlDecl + c).toUpperCase() === CDATA) {
							emitNode(parser, "onopencdata");
							parser.state = S.CDATA;
							parser.sgmlDecl = "";
							parser.cdata = "";
						} else if ((parser.sgmlDecl + c).toUpperCase() === DOCTYPE) {
							parser.state = S.DOCTYPE;
							if (parser.doctype || parser.sawRoot) strictFail(parser, "Inappropriately located doctype declaration");
							parser.doctype = "";
							parser.sgmlDecl = "";
						} else if (c === ">") {
							emitNode(parser, "onsgmldeclaration", parser.sgmlDecl);
							parser.sgmlDecl = "";
							parser.state = S.TEXT;
						} else if (isQuote(c)) {
							parser.state = S.SGML_DECL_QUOTED;
							parser.sgmlDecl += c;
						} else parser.sgmlDecl += c;
						continue;
					case S.SGML_DECL_QUOTED:
						if (c === parser.q) {
							parser.state = S.SGML_DECL;
							parser.q = "";
						}
						parser.sgmlDecl += c;
						continue;
					case S.DOCTYPE:
						if (c === ">") {
							parser.state = S.TEXT;
							emitNode(parser, "ondoctype", parser.doctype);
							parser.doctype = true;
						} else {
							parser.doctype += c;
							if (c === "[") parser.state = S.DOCTYPE_DTD;
							else if (isQuote(c)) {
								parser.state = S.DOCTYPE_QUOTED;
								parser.q = c;
							}
						}
						continue;
					case S.DOCTYPE_QUOTED:
						parser.doctype += c;
						if (c === parser.q) {
							parser.q = "";
							parser.state = S.DOCTYPE;
						}
						continue;
					case S.DOCTYPE_DTD:
						if (c === "]") {
							parser.doctype += c;
							parser.state = S.DOCTYPE;
						} else if (c === "<") {
							parser.state = S.OPEN_WAKA;
							parser.startTagPosition = parser.position;
						} else if (isQuote(c)) {
							parser.doctype += c;
							parser.state = S.DOCTYPE_DTD_QUOTED;
							parser.q = c;
						} else parser.doctype += c;
						continue;
					case S.DOCTYPE_DTD_QUOTED:
						parser.doctype += c;
						if (c === parser.q) {
							parser.state = S.DOCTYPE_DTD;
							parser.q = "";
						}
						continue;
					case S.COMMENT:
						if (c === "-") parser.state = S.COMMENT_ENDING;
						else parser.comment += c;
						continue;
					case S.COMMENT_ENDING:
						if (c === "-") {
							parser.state = S.COMMENT_ENDED;
							parser.comment = textopts(parser.opt, parser.comment);
							if (parser.comment) emitNode(parser, "oncomment", parser.comment);
							parser.comment = "";
						} else {
							parser.comment += "-" + c;
							parser.state = S.COMMENT;
						}
						continue;
					case S.COMMENT_ENDED:
						if (c !== ">") {
							strictFail(parser, "Malformed comment");
							parser.comment += "--" + c;
							parser.state = S.COMMENT;
						} else if (parser.doctype && parser.doctype !== true) parser.state = S.DOCTYPE_DTD;
						else parser.state = S.TEXT;
						continue;
					case S.CDATA:
						var starti = i - 1;
						while (c && c !== "]") {
							c = charAt(chunk, i++);
							if (c && parser.trackPosition) {
								parser.position++;
								if (c === "\n") {
									parser.line++;
									parser.column = 0;
								} else parser.column++;
							}
						}
						parser.cdata += chunk.substring(starti, i - 1);
						if (c === "]") parser.state = S.CDATA_ENDING;
						continue;
					case S.CDATA_ENDING:
						if (c === "]") parser.state = S.CDATA_ENDING_2;
						else {
							parser.cdata += "]" + c;
							parser.state = S.CDATA;
						}
						continue;
					case S.CDATA_ENDING_2:
						if (c === ">") {
							if (parser.cdata) emitNode(parser, "oncdata", parser.cdata);
							emitNode(parser, "onclosecdata");
							parser.cdata = "";
							parser.state = S.TEXT;
						} else if (c === "]") parser.cdata += "]";
						else {
							parser.cdata += "]]" + c;
							parser.state = S.CDATA;
						}
						continue;
					case S.PROC_INST:
						if (c === "?") parser.state = S.PROC_INST_ENDING;
						else if (isWhitespace(c)) parser.state = S.PROC_INST_BODY;
						else parser.procInstName += c;
						continue;
					case S.PROC_INST_BODY:
						if (!parser.procInstBody && isWhitespace(c)) continue;
						else if (c === "?") parser.state = S.PROC_INST_ENDING;
						else parser.procInstBody += c;
						continue;
					case S.PROC_INST_ENDING:
						if (c === ">") {
							const procInstEndData = {
								name: parser.procInstName,
								body: parser.procInstBody
							};
							validateXmlDeclarationEncoding(parser, procInstEndData);
							emitNode(parser, "onprocessinginstruction", procInstEndData);
							parser.procInstName = parser.procInstBody = "";
							parser.state = S.TEXT;
						} else {
							parser.procInstBody += "?" + c;
							parser.state = S.PROC_INST_BODY;
						}
						continue;
					case S.OPEN_TAG:
						if (isMatch(nameBody, c)) parser.tagName += c;
						else {
							newTag(parser);
							if (c === ">") openTag(parser);
							else if (c === "/") parser.state = S.OPEN_TAG_SLASH;
							else {
								if (!isWhitespace(c)) strictFail(parser, "Invalid character in tag name");
								parser.state = S.ATTRIB;
							}
						}
						continue;
					case S.OPEN_TAG_SLASH:
						if (c === ">") {
							openTag(parser, true);
							closeTag(parser);
						} else {
							strictFail(parser, "Forward-slash in opening tag not followed by >");
							parser.state = S.ATTRIB;
						}
						continue;
					case S.ATTRIB:
						if (isWhitespace(c)) continue;
						else if (c === ">") openTag(parser);
						else if (c === "/") parser.state = S.OPEN_TAG_SLASH;
						else if (isMatch(nameStart, c)) {
							parser.attribName = c;
							parser.attribValue = "";
							parser.state = S.ATTRIB_NAME;
						} else strictFail(parser, "Invalid attribute name");
						continue;
					case S.ATTRIB_NAME:
						if (c === "=") parser.state = S.ATTRIB_VALUE;
						else if (c === ">") {
							strictFail(parser, "Attribute without value");
							parser.attribValue = parser.attribName;
							attrib(parser);
							openTag(parser);
						} else if (isWhitespace(c)) parser.state = S.ATTRIB_NAME_SAW_WHITE;
						else if (isMatch(nameBody, c)) parser.attribName += c;
						else strictFail(parser, "Invalid attribute name");
						continue;
					case S.ATTRIB_NAME_SAW_WHITE:
						if (c === "=") parser.state = S.ATTRIB_VALUE;
						else if (isWhitespace(c)) continue;
						else {
							strictFail(parser, "Attribute without value");
							parser.tag.attributes[parser.attribName] = "";
							parser.attribValue = "";
							emitNode(parser, "onattribute", {
								name: parser.attribName,
								value: ""
							});
							parser.attribName = "";
							if (c === ">") openTag(parser);
							else if (isMatch(nameStart, c)) {
								parser.attribName = c;
								parser.state = S.ATTRIB_NAME;
							} else {
								strictFail(parser, "Invalid attribute name");
								parser.state = S.ATTRIB;
							}
						}
						continue;
					case S.ATTRIB_VALUE:
						if (isWhitespace(c)) continue;
						else if (isQuote(c)) {
							parser.q = c;
							parser.state = S.ATTRIB_VALUE_QUOTED;
						} else {
							if (!parser.opt.unquotedAttributeValues) error(parser, "Unquoted attribute value");
							parser.state = S.ATTRIB_VALUE_UNQUOTED;
							parser.attribValue = c;
						}
						continue;
					case S.ATTRIB_VALUE_QUOTED:
						if (c !== parser.q) {
							if (c === "&") parser.state = S.ATTRIB_VALUE_ENTITY_Q;
							else parser.attribValue += c;
							continue;
						}
						attrib(parser);
						parser.q = "";
						parser.state = S.ATTRIB_VALUE_CLOSED;
						continue;
					case S.ATTRIB_VALUE_CLOSED:
						if (isWhitespace(c)) parser.state = S.ATTRIB;
						else if (c === ">") openTag(parser);
						else if (c === "/") parser.state = S.OPEN_TAG_SLASH;
						else if (isMatch(nameStart, c)) {
							strictFail(parser, "No whitespace between attributes");
							parser.attribName = c;
							parser.attribValue = "";
							parser.state = S.ATTRIB_NAME;
						} else strictFail(parser, "Invalid attribute name");
						continue;
					case S.ATTRIB_VALUE_UNQUOTED:
						if (!isAttribEnd(c)) {
							if (c === "&") parser.state = S.ATTRIB_VALUE_ENTITY_U;
							else parser.attribValue += c;
							continue;
						}
						attrib(parser);
						if (c === ">") openTag(parser);
						else parser.state = S.ATTRIB;
						continue;
					case S.CLOSE_TAG:
						if (!parser.tagName) if (isWhitespace(c)) continue;
						else if (notMatch(nameStart, c)) if (parser.script) {
							parser.script += "</" + c;
							parser.state = S.SCRIPT;
						} else strictFail(parser, "Invalid tagname in closing tag.");
						else parser.tagName = c;
						else if (c === ">") closeTag(parser);
						else if (isMatch(nameBody, c)) parser.tagName += c;
						else if (parser.script) {
							parser.script += "</" + parser.tagName + c;
							parser.tagName = "";
							parser.state = S.SCRIPT;
						} else {
							if (!isWhitespace(c)) strictFail(parser, "Invalid tagname in closing tag");
							parser.state = S.CLOSE_TAG_SAW_WHITE;
						}
						continue;
					case S.CLOSE_TAG_SAW_WHITE:
						if (isWhitespace(c)) continue;
						if (c === ">") closeTag(parser);
						else strictFail(parser, "Invalid characters in closing tag");
						continue;
					case S.TEXT_ENTITY:
					case S.ATTRIB_VALUE_ENTITY_Q:
					case S.ATTRIB_VALUE_ENTITY_U:
						var returnState;
						var buffer;
						switch (parser.state) {
							case S.TEXT_ENTITY:
								returnState = S.TEXT;
								buffer = "textNode";
								break;
							case S.ATTRIB_VALUE_ENTITY_Q:
								returnState = S.ATTRIB_VALUE_QUOTED;
								buffer = "attribValue";
								break;
							case S.ATTRIB_VALUE_ENTITY_U:
								returnState = S.ATTRIB_VALUE_UNQUOTED;
								buffer = "attribValue";
								break;
						}
						if (c === ";") {
							var parsedEntity = parseEntity(parser);
							if (parser.opt.unparsedEntities && !Object.values(sax.XML_ENTITIES).includes(parsedEntity)) {
								if ((parser.entityCount += 1) > parser.opt.maxEntityCount) error(parser, "Parsed entity count exceeds max entity count");
								if ((parser.entityDepth += 1) > parser.opt.maxEntityDepth) error(parser, "Parsed entity depth exceeds max entity depth");
								parser.entity = "";
								parser.state = returnState;
								parser.write(parsedEntity);
								parser.entityDepth -= 1;
							} else {
								parser[buffer] += parsedEntity;
								parser.entity = "";
								parser.state = returnState;
							}
						} else if (isMatch(parser.entity.length ? entityBody : entityStart, c)) parser.entity += c;
						else {
							strictFail(parser, "Invalid character in entity name");
							parser[buffer] += "&" + parser.entity + c;
							parser.entity = "";
							parser.state = returnState;
						}
						continue;
					default: throw new Error(parser, "Unknown state: " + parser.state);
				}
			}
			if (parser.position >= parser.bufferCheckPosition) checkBufferLength(parser);
			return parser;
		}
		/*! http://mths.be/fromcodepoint v0.1.0 by @mathias */
		/* istanbul ignore next */
		if (!String.fromCodePoint) (function() {
			var stringFromCharCode = String.fromCharCode;
			var floor = Math.floor;
			var fromCodePoint = function() {
				var MAX_SIZE = 16384;
				var codeUnits = [];
				var highSurrogate;
				var lowSurrogate;
				var index = -1;
				var length = arguments.length;
				if (!length) return "";
				var result = "";
				while (++index < length) {
					var codePoint = Number(arguments[index]);
					if (!isFinite(codePoint) || codePoint < 0 || codePoint > 1114111 || floor(codePoint) !== codePoint) throw RangeError("Invalid code point: " + codePoint);
					if (codePoint <= 65535) codeUnits.push(codePoint);
					else {
						codePoint -= 65536;
						highSurrogate = (codePoint >> 10) + 55296;
						lowSurrogate = codePoint % 1024 + 56320;
						codeUnits.push(highSurrogate, lowSurrogate);
					}
					if (index + 1 === length || codeUnits.length > MAX_SIZE) {
						result += stringFromCharCode.apply(null, codeUnits);
						codeUnits.length = 0;
					}
				}
				return result;
			};
			/* istanbul ignore next */
			if (Object.defineProperty) Object.defineProperty(String, "fromCodePoint", {
				value: fromCodePoint,
				configurable: true,
				writable: true
			});
			else String.fromCodePoint = fromCodePoint;
		})();
	})(typeof exports === "undefined" ? exports.sax = {} : exports);
}));
//#endregion
//#region node_modules/xml-js/lib/array-helper.js
var require_array_helper = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = { isArray: function(value) {
		if (Array.isArray) return Array.isArray(value);
		return Object.prototype.toString.call(value) === "[object Array]";
	} };
}));
//#endregion
//#region node_modules/xml-js/lib/options-helper.js
var require_options_helper = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var isArray = require_array_helper().isArray;
	module.exports = {
		copyOptions: function(options) {
			var key, copy = {};
			for (key in options) if (options.hasOwnProperty(key)) copy[key] = options[key];
			return copy;
		},
		ensureFlagExists: function(item, options) {
			if (!(item in options) || typeof options[item] !== "boolean") options[item] = false;
		},
		ensureSpacesExists: function(options) {
			if (!("spaces" in options) || typeof options.spaces !== "number" && typeof options.spaces !== "string") options.spaces = 0;
		},
		ensureAlwaysArrayExists: function(options) {
			if (!("alwaysArray" in options) || typeof options.alwaysArray !== "boolean" && !isArray(options.alwaysArray)) options.alwaysArray = false;
		},
		ensureKeyExists: function(key, options) {
			if (!(key + "Key" in options) || typeof options[key + "Key"] !== "string") options[key + "Key"] = options.compact ? "_" + key : key;
		},
		checkFnExists: function(key, options) {
			return key + "Fn" in options;
		}
	};
}));
//#endregion
//#region node_modules/xml-js/lib/xml2js.js
var require_xml2js = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var sax = require_sax();
	var expat = {
		on: function() {},
		parse: function() {}
	};
	var helper = require_options_helper();
	var isArray = require_array_helper().isArray;
	var options;
	var pureJsParser = true;
	var currentElement;
	function validateOptions(userOptions) {
		options = helper.copyOptions(userOptions);
		helper.ensureFlagExists("ignoreDeclaration", options);
		helper.ensureFlagExists("ignoreInstruction", options);
		helper.ensureFlagExists("ignoreAttributes", options);
		helper.ensureFlagExists("ignoreText", options);
		helper.ensureFlagExists("ignoreComment", options);
		helper.ensureFlagExists("ignoreCdata", options);
		helper.ensureFlagExists("ignoreDoctype", options);
		helper.ensureFlagExists("compact", options);
		helper.ensureFlagExists("alwaysChildren", options);
		helper.ensureFlagExists("addParent", options);
		helper.ensureFlagExists("trim", options);
		helper.ensureFlagExists("nativeType", options);
		helper.ensureFlagExists("nativeTypeAttributes", options);
		helper.ensureFlagExists("sanitize", options);
		helper.ensureFlagExists("instructionHasAttributes", options);
		helper.ensureFlagExists("captureSpacesBetweenElements", options);
		helper.ensureAlwaysArrayExists(options);
		helper.ensureKeyExists("declaration", options);
		helper.ensureKeyExists("instruction", options);
		helper.ensureKeyExists("attributes", options);
		helper.ensureKeyExists("text", options);
		helper.ensureKeyExists("comment", options);
		helper.ensureKeyExists("cdata", options);
		helper.ensureKeyExists("doctype", options);
		helper.ensureKeyExists("type", options);
		helper.ensureKeyExists("name", options);
		helper.ensureKeyExists("elements", options);
		helper.ensureKeyExists("parent", options);
		helper.checkFnExists("doctype", options);
		helper.checkFnExists("instruction", options);
		helper.checkFnExists("cdata", options);
		helper.checkFnExists("comment", options);
		helper.checkFnExists("text", options);
		helper.checkFnExists("instructionName", options);
		helper.checkFnExists("elementName", options);
		helper.checkFnExists("attributeName", options);
		helper.checkFnExists("attributeValue", options);
		helper.checkFnExists("attributes", options);
		return options;
	}
	function nativeType(value) {
		var nValue = Number(value);
		if (!isNaN(nValue)) return nValue;
		var bValue = value.toLowerCase();
		if (bValue === "true") return true;
		else if (bValue === "false") return false;
		return value;
	}
	function addField(type, value) {
		var key;
		if (options.compact) {
			if (!currentElement[options[type + "Key"]] && (isArray(options.alwaysArray) ? options.alwaysArray.indexOf(options[type + "Key"]) !== -1 : options.alwaysArray)) currentElement[options[type + "Key"]] = [];
			if (currentElement[options[type + "Key"]] && !isArray(currentElement[options[type + "Key"]])) currentElement[options[type + "Key"]] = [currentElement[options[type + "Key"]]];
			if (type + "Fn" in options && typeof value === "string") value = options[type + "Fn"](value, currentElement);
			if (type === "instruction" && ("instructionFn" in options || "instructionNameFn" in options)) {
				for (key in value) if (value.hasOwnProperty(key)) if ("instructionFn" in options) value[key] = options.instructionFn(value[key], key, currentElement);
				else {
					var temp = value[key];
					delete value[key];
					value[options.instructionNameFn(key, temp, currentElement)] = temp;
				}
			}
			if (isArray(currentElement[options[type + "Key"]])) currentElement[options[type + "Key"]].push(value);
			else currentElement[options[type + "Key"]] = value;
		} else {
			if (!currentElement[options.elementsKey]) currentElement[options.elementsKey] = [];
			var element = {};
			element[options.typeKey] = type;
			if (type === "instruction") {
				for (key in value) if (value.hasOwnProperty(key)) break;
				element[options.nameKey] = "instructionNameFn" in options ? options.instructionNameFn(key, value, currentElement) : key;
				if (options.instructionHasAttributes) {
					element[options.attributesKey] = value[key][options.attributesKey];
					if ("instructionFn" in options) element[options.attributesKey] = options.instructionFn(element[options.attributesKey], key, currentElement);
				} else {
					if ("instructionFn" in options) value[key] = options.instructionFn(value[key], key, currentElement);
					element[options.instructionKey] = value[key];
				}
			} else {
				if (type + "Fn" in options) value = options[type + "Fn"](value, currentElement);
				element[options[type + "Key"]] = value;
			}
			if (options.addParent) element[options.parentKey] = currentElement;
			currentElement[options.elementsKey].push(element);
		}
	}
	function manipulateAttributes(attributes) {
		if ("attributesFn" in options && attributes) attributes = options.attributesFn(attributes, currentElement);
		if ((options.trim || "attributeValueFn" in options || "attributeNameFn" in options || options.nativeTypeAttributes) && attributes) {
			var key;
			for (key in attributes) if (attributes.hasOwnProperty(key)) {
				if (options.trim) attributes[key] = attributes[key].trim();
				if (options.nativeTypeAttributes) attributes[key] = nativeType(attributes[key]);
				if ("attributeValueFn" in options) attributes[key] = options.attributeValueFn(attributes[key], key, currentElement);
				if ("attributeNameFn" in options) {
					var temp = attributes[key];
					delete attributes[key];
					attributes[options.attributeNameFn(key, attributes[key], currentElement)] = temp;
				}
			}
		}
		return attributes;
	}
	function onInstruction(instruction) {
		var attributes = {};
		if (instruction.body && (instruction.name.toLowerCase() === "xml" || options.instructionHasAttributes)) {
			var attrsRegExp = /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|(\w+))\s*/g;
			var match;
			while ((match = attrsRegExp.exec(instruction.body)) !== null) attributes[match[1]] = match[2] || match[3] || match[4];
			attributes = manipulateAttributes(attributes);
		}
		if (instruction.name.toLowerCase() === "xml") {
			if (options.ignoreDeclaration) return;
			currentElement[options.declarationKey] = {};
			if (Object.keys(attributes).length) currentElement[options.declarationKey][options.attributesKey] = attributes;
			if (options.addParent) currentElement[options.declarationKey][options.parentKey] = currentElement;
		} else {
			if (options.ignoreInstruction) return;
			if (options.trim) instruction.body = instruction.body.trim();
			var value = {};
			if (options.instructionHasAttributes && Object.keys(attributes).length) {
				value[instruction.name] = {};
				value[instruction.name][options.attributesKey] = attributes;
			} else value[instruction.name] = instruction.body;
			addField("instruction", value);
		}
	}
	function onStartElement(name, attributes) {
		var element;
		if (typeof name === "object") {
			attributes = name.attributes;
			name = name.name;
		}
		attributes = manipulateAttributes(attributes);
		if ("elementNameFn" in options) name = options.elementNameFn(name, currentElement);
		if (options.compact) {
			element = {};
			if (!options.ignoreAttributes && attributes && Object.keys(attributes).length) {
				element[options.attributesKey] = {};
				var key;
				for (key in attributes) if (attributes.hasOwnProperty(key)) element[options.attributesKey][key] = attributes[key];
			}
			if (!(name in currentElement) && (isArray(options.alwaysArray) ? options.alwaysArray.indexOf(name) !== -1 : options.alwaysArray)) currentElement[name] = [];
			if (currentElement[name] && !isArray(currentElement[name])) currentElement[name] = [currentElement[name]];
			if (isArray(currentElement[name])) currentElement[name].push(element);
			else currentElement[name] = element;
		} else {
			if (!currentElement[options.elementsKey]) currentElement[options.elementsKey] = [];
			element = {};
			element[options.typeKey] = "element";
			element[options.nameKey] = name;
			if (!options.ignoreAttributes && attributes && Object.keys(attributes).length) element[options.attributesKey] = attributes;
			if (options.alwaysChildren) element[options.elementsKey] = [];
			currentElement[options.elementsKey].push(element);
		}
		element[options.parentKey] = currentElement;
		currentElement = element;
	}
	function onText(text) {
		if (options.ignoreText) return;
		if (!text.trim() && !options.captureSpacesBetweenElements) return;
		if (options.trim) text = text.trim();
		if (options.nativeType) text = nativeType(text);
		if (options.sanitize) text = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
		addField("text", text);
	}
	function onComment(comment) {
		if (options.ignoreComment) return;
		if (options.trim) comment = comment.trim();
		addField("comment", comment);
	}
	function onEndElement(name) {
		var parentElement = currentElement[options.parentKey];
		if (!options.addParent) delete currentElement[options.parentKey];
		currentElement = parentElement;
	}
	function onCdata(cdata) {
		if (options.ignoreCdata) return;
		if (options.trim) cdata = cdata.trim();
		addField("cdata", cdata);
	}
	function onDoctype(doctype) {
		if (options.ignoreDoctype) return;
		doctype = doctype.replace(/^ /, "");
		if (options.trim) doctype = doctype.trim();
		addField("doctype", doctype);
	}
	function onError(error) {
		error.note = error;
	}
	module.exports = function(xml, userOptions) {
		var parser = pureJsParser ? sax.parser(true, {}) : parser = new expat.Parser("UTF-8");
		var result = {};
		currentElement = result;
		options = validateOptions(userOptions);
		if (pureJsParser) {
			parser.opt = { strictEntities: true };
			parser.onopentag = onStartElement;
			parser.ontext = onText;
			parser.oncomment = onComment;
			parser.onclosetag = onEndElement;
			parser.onerror = onError;
			parser.oncdata = onCdata;
			parser.ondoctype = onDoctype;
			parser.onprocessinginstruction = onInstruction;
		} else {
			parser.on("startElement", onStartElement);
			parser.on("text", onText);
			parser.on("comment", onComment);
			parser.on("endElement", onEndElement);
			parser.on("error", onError);
		}
		if (pureJsParser) parser.write(xml).close();
		else if (!parser.parse(xml)) throw new Error("XML parsing error: " + parser.getError());
		if (result[options.elementsKey]) {
			var temp = result[options.elementsKey];
			delete result[options.elementsKey];
			result[options.elementsKey] = temp;
			delete result.text;
		}
		return result;
	};
}));
//#endregion
//#region node_modules/xml-js/lib/xml2json.js
var require_xml2json = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var helper = require_options_helper();
	var xml2js = require_xml2js();
	function validateOptions(userOptions) {
		var options = helper.copyOptions(userOptions);
		helper.ensureSpacesExists(options);
		return options;
	}
	module.exports = function(xml, userOptions) {
		var options = validateOptions(userOptions), js = xml2js(xml, options), json, parentKey = "compact" in options && options.compact ? "_parent" : "parent";
		if ("addParent" in options && options.addParent) json = JSON.stringify(js, function(k, v) {
			return k === parentKey ? "_" : v;
		}, options.spaces);
		else json = JSON.stringify(js, null, options.spaces);
		return json.replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
	};
}));
//#endregion
//#region node_modules/xml-js/lib/js2xml.js
var require_js2xml = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var helper = require_options_helper();
	var isArray = require_array_helper().isArray;
	var currentElement, currentElementName;
	function validateOptions(userOptions) {
		var options = helper.copyOptions(userOptions);
		helper.ensureFlagExists("ignoreDeclaration", options);
		helper.ensureFlagExists("ignoreInstruction", options);
		helper.ensureFlagExists("ignoreAttributes", options);
		helper.ensureFlagExists("ignoreText", options);
		helper.ensureFlagExists("ignoreComment", options);
		helper.ensureFlagExists("ignoreCdata", options);
		helper.ensureFlagExists("ignoreDoctype", options);
		helper.ensureFlagExists("compact", options);
		helper.ensureFlagExists("indentText", options);
		helper.ensureFlagExists("indentCdata", options);
		helper.ensureFlagExists("indentAttributes", options);
		helper.ensureFlagExists("indentInstruction", options);
		helper.ensureFlagExists("fullTagEmptyElement", options);
		helper.ensureFlagExists("noQuotesForNativeAttributes", options);
		helper.ensureSpacesExists(options);
		if (typeof options.spaces === "number") options.spaces = Array(options.spaces + 1).join(" ");
		helper.ensureKeyExists("declaration", options);
		helper.ensureKeyExists("instruction", options);
		helper.ensureKeyExists("attributes", options);
		helper.ensureKeyExists("text", options);
		helper.ensureKeyExists("comment", options);
		helper.ensureKeyExists("cdata", options);
		helper.ensureKeyExists("doctype", options);
		helper.ensureKeyExists("type", options);
		helper.ensureKeyExists("name", options);
		helper.ensureKeyExists("elements", options);
		helper.checkFnExists("doctype", options);
		helper.checkFnExists("instruction", options);
		helper.checkFnExists("cdata", options);
		helper.checkFnExists("comment", options);
		helper.checkFnExists("text", options);
		helper.checkFnExists("instructionName", options);
		helper.checkFnExists("elementName", options);
		helper.checkFnExists("attributeName", options);
		helper.checkFnExists("attributeValue", options);
		helper.checkFnExists("attributes", options);
		helper.checkFnExists("fullTagEmptyElement", options);
		return options;
	}
	function writeIndentation(options, depth, firstLine) {
		return (!firstLine && options.spaces ? "\n" : "") + Array(depth + 1).join(options.spaces);
	}
	function writeAttributes(attributes, options, depth) {
		if (options.ignoreAttributes) return "";
		if ("attributesFn" in options) attributes = options.attributesFn(attributes, currentElementName, currentElement);
		var key, attr, attrName, quote, result = [];
		for (key in attributes) if (attributes.hasOwnProperty(key) && attributes[key] !== null && attributes[key] !== void 0) {
			quote = options.noQuotesForNativeAttributes && typeof attributes[key] !== "string" ? "" : "\"";
			attr = "" + attributes[key];
			attr = attr.replace(/"/g, "&quot;");
			attrName = "attributeNameFn" in options ? options.attributeNameFn(key, attr, currentElementName, currentElement) : key;
			result.push(options.spaces && options.indentAttributes ? writeIndentation(options, depth + 1, false) : " ");
			result.push(attrName + "=" + quote + ("attributeValueFn" in options ? options.attributeValueFn(attr, key, currentElementName, currentElement) : attr) + quote);
		}
		if (attributes && Object.keys(attributes).length && options.spaces && options.indentAttributes) result.push(writeIndentation(options, depth, false));
		return result.join("");
	}
	function writeDeclaration(declaration, options, depth) {
		currentElement = declaration;
		currentElementName = "xml";
		return options.ignoreDeclaration ? "" : "<?xml" + writeAttributes(declaration[options.attributesKey], options, depth) + "?>";
	}
	function writeInstruction(instruction, options, depth) {
		if (options.ignoreInstruction) return "";
		var key;
		for (key in instruction) if (instruction.hasOwnProperty(key)) break;
		var instructionName = "instructionNameFn" in options ? options.instructionNameFn(key, instruction[key], currentElementName, currentElement) : key;
		if (typeof instruction[key] === "object") {
			currentElement = instruction;
			currentElementName = instructionName;
			return "<?" + instructionName + writeAttributes(instruction[key][options.attributesKey], options, depth) + "?>";
		} else {
			var instructionValue = instruction[key] ? instruction[key] : "";
			if ("instructionFn" in options) instructionValue = options.instructionFn(instructionValue, key, currentElementName, currentElement);
			return "<?" + instructionName + (instructionValue ? " " + instructionValue : "") + "?>";
		}
	}
	function writeComment(comment, options) {
		return options.ignoreComment ? "" : "<!--" + ("commentFn" in options ? options.commentFn(comment, currentElementName, currentElement) : comment) + "-->";
	}
	function writeCdata(cdata, options) {
		return options.ignoreCdata ? "" : "<![CDATA[" + ("cdataFn" in options ? options.cdataFn(cdata, currentElementName, currentElement) : cdata.replace("]]>", "]]]]><![CDATA[>")) + "]]>";
	}
	function writeDoctype(doctype, options) {
		return options.ignoreDoctype ? "" : "<!DOCTYPE " + ("doctypeFn" in options ? options.doctypeFn(doctype, currentElementName, currentElement) : doctype) + ">";
	}
	function writeText(text, options) {
		if (options.ignoreText) return "";
		text = "" + text;
		text = text.replace(/&amp;/g, "&");
		text = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
		return "textFn" in options ? options.textFn(text, currentElementName, currentElement) : text;
	}
	function hasContent(element, options) {
		var i;
		if (element.elements && element.elements.length) for (i = 0; i < element.elements.length; ++i) switch (element.elements[i][options.typeKey]) {
			case "text":
				if (options.indentText) return true;
				break;
			case "cdata":
				if (options.indentCdata) return true;
				break;
			case "instruction":
				if (options.indentInstruction) return true;
				break;
			case "doctype":
			case "comment":
			case "element": return true;
			default: return true;
		}
		return false;
	}
	function writeElement(element, options, depth) {
		currentElement = element;
		currentElementName = element.name;
		var xml = [], elementName = "elementNameFn" in options ? options.elementNameFn(element.name, element) : element.name;
		xml.push("<" + elementName);
		if (element[options.attributesKey]) xml.push(writeAttributes(element[options.attributesKey], options, depth));
		var withClosingTag = element[options.elementsKey] && element[options.elementsKey].length || element[options.attributesKey] && element[options.attributesKey]["xml:space"] === "preserve";
		if (!withClosingTag) if ("fullTagEmptyElementFn" in options) withClosingTag = options.fullTagEmptyElementFn(element.name, element);
		else withClosingTag = options.fullTagEmptyElement;
		if (withClosingTag) {
			xml.push(">");
			if (element[options.elementsKey] && element[options.elementsKey].length) {
				xml.push(writeElements(element[options.elementsKey], options, depth + 1));
				currentElement = element;
				currentElementName = element.name;
			}
			xml.push(options.spaces && hasContent(element, options) ? "\n" + Array(depth + 1).join(options.spaces) : "");
			xml.push("</" + elementName + ">");
		} else xml.push("/>");
		return xml.join("");
	}
	function writeElements(elements, options, depth, firstLine) {
		return elements.reduce(function(xml, element) {
			var indent = writeIndentation(options, depth, firstLine && !xml);
			switch (element.type) {
				case "element": return xml + indent + writeElement(element, options, depth);
				case "comment": return xml + indent + writeComment(element[options.commentKey], options);
				case "doctype": return xml + indent + writeDoctype(element[options.doctypeKey], options);
				case "cdata": return xml + (options.indentCdata ? indent : "") + writeCdata(element[options.cdataKey], options);
				case "text": return xml + (options.indentText ? indent : "") + writeText(element[options.textKey], options);
				case "instruction":
					var instruction = {};
					instruction[element[options.nameKey]] = element[options.attributesKey] ? element : element[options.instructionKey];
					return xml + (options.indentInstruction ? indent : "") + writeInstruction(instruction, options, depth);
			}
		}, "");
	}
	function hasContentCompact(element, options, anyContent) {
		var key;
		for (key in element) if (element.hasOwnProperty(key)) switch (key) {
			case options.parentKey:
			case options.attributesKey: break;
			case options.textKey:
				if (options.indentText || anyContent) return true;
				break;
			case options.cdataKey:
				if (options.indentCdata || anyContent) return true;
				break;
			case options.instructionKey:
				if (options.indentInstruction || anyContent) return true;
				break;
			case options.doctypeKey:
			case options.commentKey: return true;
			default: return true;
		}
		return false;
	}
	function writeElementCompact(element, name, options, depth, indent) {
		currentElement = element;
		currentElementName = name;
		var elementName = "elementNameFn" in options ? options.elementNameFn(name, element) : name;
		if (typeof element === "undefined" || element === null || element === "") return "fullTagEmptyElementFn" in options && options.fullTagEmptyElementFn(name, element) || options.fullTagEmptyElement ? "<" + elementName + "></" + elementName + ">" : "<" + elementName + "/>";
		var xml = [];
		if (name) {
			xml.push("<" + elementName);
			if (typeof element !== "object") {
				xml.push(">" + writeText(element, options) + "</" + elementName + ">");
				return xml.join("");
			}
			if (element[options.attributesKey]) xml.push(writeAttributes(element[options.attributesKey], options, depth));
			var withClosingTag = hasContentCompact(element, options, true) || element[options.attributesKey] && element[options.attributesKey]["xml:space"] === "preserve";
			if (!withClosingTag) if ("fullTagEmptyElementFn" in options) withClosingTag = options.fullTagEmptyElementFn(name, element);
			else withClosingTag = options.fullTagEmptyElement;
			if (withClosingTag) xml.push(">");
			else {
				xml.push("/>");
				return xml.join("");
			}
		}
		xml.push(writeElementsCompact(element, options, depth + 1, false));
		currentElement = element;
		currentElementName = name;
		if (name) xml.push((indent ? writeIndentation(options, depth, false) : "") + "</" + elementName + ">");
		return xml.join("");
	}
	function writeElementsCompact(element, options, depth, firstLine) {
		var i, key, nodes, xml = [];
		for (key in element) if (element.hasOwnProperty(key)) {
			nodes = isArray(element[key]) ? element[key] : [element[key]];
			for (i = 0; i < nodes.length; ++i) {
				switch (key) {
					case options.declarationKey:
						xml.push(writeDeclaration(nodes[i], options, depth));
						break;
					case options.instructionKey:
						xml.push((options.indentInstruction ? writeIndentation(options, depth, firstLine) : "") + writeInstruction(nodes[i], options, depth));
						break;
					case options.attributesKey:
					case options.parentKey: break;
					case options.textKey:
						xml.push((options.indentText ? writeIndentation(options, depth, firstLine) : "") + writeText(nodes[i], options));
						break;
					case options.cdataKey:
						xml.push((options.indentCdata ? writeIndentation(options, depth, firstLine) : "") + writeCdata(nodes[i], options));
						break;
					case options.doctypeKey:
						xml.push(writeIndentation(options, depth, firstLine) + writeDoctype(nodes[i], options));
						break;
					case options.commentKey:
						xml.push(writeIndentation(options, depth, firstLine) + writeComment(nodes[i], options));
						break;
					default: xml.push(writeIndentation(options, depth, firstLine) + writeElementCompact(nodes[i], key, options, depth, hasContentCompact(nodes[i], options)));
				}
				firstLine = firstLine && !xml.length;
			}
		}
		return xml.join("");
	}
	module.exports = function(js, options) {
		options = validateOptions(options);
		var xml = [];
		currentElement = js;
		currentElementName = "_root_";
		if (options.compact) xml.push(writeElementsCompact(js, options, 0, true));
		else {
			if (js[options.declarationKey]) xml.push(writeDeclaration(js[options.declarationKey], options, 0));
			if (js[options.elementsKey] && js[options.elementsKey].length) xml.push(writeElements(js[options.elementsKey], options, 0, !xml.length));
		}
		return xml.join("");
	};
}));
//#endregion
//#region node_modules/xml-js/lib/json2xml.js
var require_json2xml = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	var js2xml = require_js2xml();
	module.exports = function(json, options) {
		if (json instanceof Buffer) json = json.toString();
		var js = null;
		if (typeof json === "string") try {
			js = JSON.parse(json);
		} catch (e) {
			throw new Error("The JSON structure is invalid");
		}
		else js = json;
		return js2xml(js, options);
	};
}));
//#endregion
//#region node_modules/xml-js/lib/index.js
var require_lib = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = {
		xml2js: require_xml2js(),
		xml2json: require_xml2json(),
		js2xml: require_js2xml(),
		json2xml: require_json2xml()
	};
}));
//#endregion
//#region node_modules/base-64/base64.js
var require_base64 = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	(function(root) {
		var freeExports = typeof exports == "object" && exports;
		var freeModule = typeof module == "object" && module && module.exports == freeExports && module;
		var freeGlobal = typeof global == "object" && global;
		if (freeGlobal.global === freeGlobal || freeGlobal.window === freeGlobal) root = freeGlobal;
		var InvalidCharacterError = function(message) {
			this.message = message;
		};
		InvalidCharacterError.prototype = /* @__PURE__ */ new Error();
		InvalidCharacterError.prototype.name = "InvalidCharacterError";
		var error = function(message) {
			throw new InvalidCharacterError(message);
		};
		var TABLE = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
		var REGEX_SPACE_CHARACTERS = /[\t\n\f\r ]/g;
		var decode = function(input) {
			input = String(input).replace(REGEX_SPACE_CHARACTERS, "");
			var length = input.length;
			if (length % 4 == 0) {
				input = input.replace(/==?$/, "");
				length = input.length;
			}
			if (length % 4 == 1 || /[^+a-zA-Z0-9/]/.test(input)) error("Invalid character: the string to be decoded is not correctly encoded.");
			var bitCounter = 0;
			var bitStorage;
			var buffer;
			var output = "";
			var position = -1;
			while (++position < length) {
				buffer = TABLE.indexOf(input.charAt(position));
				bitStorage = bitCounter % 4 ? bitStorage * 64 + buffer : buffer;
				if (bitCounter++ % 4) output += String.fromCharCode(255 & bitStorage >> (-2 * bitCounter & 6));
			}
			return output;
		};
		var encode = function(input) {
			input = String(input);
			if (/[^\0-\xFF]/.test(input)) error("The string to be encoded contains characters outside of the Latin1 range.");
			var padding = input.length % 3;
			var output = "";
			var position = -1;
			var a;
			var b;
			var c;
			var buffer;
			var length = input.length - padding;
			while (++position < length) {
				a = input.charCodeAt(position) << 16;
				b = input.charCodeAt(++position) << 8;
				c = input.charCodeAt(++position);
				buffer = a + b + c;
				output += TABLE.charAt(buffer >> 18 & 63) + TABLE.charAt(buffer >> 12 & 63) + TABLE.charAt(buffer >> 6 & 63) + TABLE.charAt(buffer & 63);
			}
			if (padding == 2) {
				a = input.charCodeAt(position) << 8;
				b = input.charCodeAt(++position);
				buffer = a + b;
				output += TABLE.charAt(buffer >> 10) + TABLE.charAt(buffer >> 4 & 63) + TABLE.charAt(buffer << 2 & 63) + "=";
			} else if (padding == 1) {
				buffer = input.charCodeAt(position);
				output += TABLE.charAt(buffer >> 2) + TABLE.charAt(buffer << 4 & 63) + "==";
			}
			return output;
		};
		var base64 = {
			"encode": encode,
			"decode": decode,
			"version": "1.0.0"
		};
		if (typeof define == "function" && typeof define.amd == "object" && define.amd) define(function() {
			return base64;
		});
		else if (freeExports && !freeExports.nodeType) if (freeModule) freeModule.exports = base64;
		else for (var key in base64) base64.hasOwnProperty(key) && (freeExports[key] = base64[key]);
		else root.base64 = base64;
	})(exports);
}));
//#endregion
//#region node_modules/tsdav/dist/tsdav.esm.js
var import_src = /* @__PURE__ */ __toESM(require_src());
var import_lib = /* @__PURE__ */ __toESM(require_lib());
var import_base64 = /* @__PURE__ */ __toESM(require_base64());
var DAVNamespace;
(function(DAVNamespace) {
	DAVNamespace["CALENDAR_SERVER"] = "http://calendarserver.org/ns/";
	DAVNamespace["CALDAV_APPLE"] = "http://apple.com/ns/ical/";
	DAVNamespace["CALDAV"] = "urn:ietf:params:xml:ns:caldav";
	DAVNamespace["CARDDAV"] = "urn:ietf:params:xml:ns:carddav";
	DAVNamespace["DAV"] = "DAV:";
})(DAVNamespace || (DAVNamespace = {}));
const DAVAttributeMap = {
	[DAVNamespace.CALDAV]: "xmlns:c",
	[DAVNamespace.CARDDAV]: "xmlns:card",
	[DAVNamespace.CALENDAR_SERVER]: "xmlns:cs",
	[DAVNamespace.CALDAV_APPLE]: "xmlns:ca",
	[DAVNamespace.DAV]: "xmlns:d"
};
var DAVNamespaceShort;
(function(DAVNamespaceShort) {
	DAVNamespaceShort["CALDAV"] = "c";
	DAVNamespaceShort["CARDDAV"] = "card";
	DAVNamespaceShort["CALENDAR_SERVER"] = "cs";
	DAVNamespaceShort["CALDAV_APPLE"] = "ca";
	DAVNamespaceShort["DAV"] = "d";
})(DAVNamespaceShort || (DAVNamespaceShort = {}));
var ICALObjects;
(function(ICALObjects) {
	ICALObjects["VEVENT"] = "VEVENT";
	ICALObjects["VTODO"] = "VTODO";
	ICALObjects["VJOURNAL"] = "VJOURNAL";
	ICALObjects["VFREEBUSY"] = "VFREEBUSY";
	ICALObjects["VTIMEZONE"] = "VTIMEZONE";
	ICALObjects["VALARM"] = "VALARM";
})(ICALObjects || (ICALObjects = {}));
const camelCase = (str) => str.replace(/[-_]+(\w?)/g, (_m, c) => c ? c.toUpperCase() : "");
/**
* Resolve the runtime `fetch` implementation.
*
* All supported runtimes expose a standards-compliant `fetch` on
* `globalThis`:
*   - Node.js >= 18 (the minimum declared in package.json#engines)
*   - Modern browsers
*   - Bun (all versions)
*   - Deno (all versions)
*   - Cloudflare Workers, Electron, KaiOS 3+
*
* Exotic hosts without a global `fetch` must either install a polyfill on
* `globalThis` before importing tsdav, or pass their own `fetch`
* implementation to `createDAVClient`, the `DAVClient` constructor, or the
* individual request helpers.
*/
const resolveFetch = () => {
	if (typeof globalThis !== "undefined" && typeof globalThis.fetch === "function") return globalThis.fetch.bind(globalThis);
	return (() => {
		throw new Error("tsdav: global fetch is not available in this runtime. Upgrade to Node.js >= 18, run under a browser/Bun/Deno, or install a fetch polyfill on globalThis before importing tsdav. You can also pass a custom `fetch` implementation to `createDAVClient`, `DAVClient`, or individual request helpers.");
	});
};
const fetch = resolveFetch();
const NUMERIC_RE = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;
const nativeType = (value) => {
	if (typeof value !== "string") return value;
	if (NUMERIC_RE.test(value)) {
		const nValue = Number(value);
		if (!Number.isNaN(nValue) && Number.isFinite(nValue)) return nValue;
	}
	const bValue = value.toLowerCase();
	if (bValue === "true") return true;
	if (bValue === "false") return false;
	return value;
};
const normalizeUrl = (url) => {
	const trimmed = url.trim();
	return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
};
/**
* Strict URL equality after trimming whitespace and a single trailing slash.
* Two URLs are equal if and only if their normalized forms are identical.
*/
const urlEquals = (urlA, urlB) => {
	if (!urlA && !urlB) return true;
	if (!urlA || !urlB) return false;
	return normalizeUrl(urlA) === normalizeUrl(urlB);
};
/**
* Loose URL containment check used for matching DAV responses against known
* collection/principal URLs. Tolerates trailing slashes and partial vs. full
* URLs (e.g. "www.example.com" vs. "https://www.example.com/").
*
* NOTE: this is intentionally permissive to accommodate DAV servers that
* return hrefs as paths instead of full URLs. Callers MUST only compare URLs
* at the same hierarchy level (collection-to-collection, object-to-object).
* Comparing a collection URL against an object URL will produce false
* positives because the collection URL is a prefix of the object URL.
*/
const urlContains = (urlA, urlB) => {
	if (!urlA && !urlB) return true;
	if (!urlA || !urlB) return false;
	const strippedUrlA = normalizeUrl(urlA);
	const strippedUrlB = normalizeUrl(urlB);
	return strippedUrlA.includes(strippedUrlB) || strippedUrlB.includes(strippedUrlA);
};
const getDAVAttribute = (nsArr) => nsArr.reduce((prev, curr) => ({
	...prev,
	[DAVAttributeMap[curr]]: curr
}), {});
const cleanupFalsy = (obj) => Object.entries(obj).reduce((prev, [key, value]) => {
	if (value) return {
		...prev,
		[key]: value
	};
	return prev;
}, {});
const conditionalParam = (key, param) => {
	if (param) return { [key]: param };
	return {};
};
const excludeHeaders = (headers, headersToExclude) => {
	if (!headers) return {};
	if (!headersToExclude || headersToExclude.length === 0) return headers;
	const excludeSet = new Set(headersToExclude.map((h) => h.toLowerCase()));
	return Object.fromEntries(Object.entries(headers).filter(([key]) => !excludeSet.has(key.toLowerCase())));
};
var requestHelpers = /* @__PURE__ */ Object.freeze({
	__proto__: null,
	cleanupFalsy,
	conditionalParam,
	excludeHeaders,
	getDAVAttribute,
	urlContains,
	urlEquals
});
const debug$5 = (0, import_src.default)("tsdav:request");
const davRequest = async (params) => {
	var _a;
	const { url, init, convertIncoming = true, parseOutgoing = true, fetchOptions = {}, fetch: fetchOverride } = params;
	const requestFetch = fetchOverride !== null && fetchOverride !== void 0 ? fetchOverride : fetch;
	const { headers = {}, body, namespace, method, attributes } = init;
	const xmlBody = convertIncoming ? import_lib.default.js2xml({
		_declaration: { _attributes: {
			version: "1.0",
			encoding: "utf-8"
		} },
		_attributes: attributes,
		...body
	}, {
		compact: true,
		spaces: 2,
		elementNameFn: (name) => {
			if (namespace && !/^.+:.+/.test(name)) return `${namespace}:${name}`;
			return name;
		}
	}) : body;
	const fetchOptionsWithoutHeaders = { ...fetchOptions };
	delete fetchOptionsWithoutHeaders.headers;
	const mergedHeaders = {};
	const setHeader = (key, value) => {
		if (value == null) return;
		const lower = key.toLowerCase();
		Object.keys(mergedHeaders).forEach((existing) => {
			if (existing.toLowerCase() === lower) delete mergedHeaders[existing];
		});
		mergedHeaders[key] = value;
	};
	setHeader("Content-Type", "text/xml;charset=UTF-8");
	Object.entries(cleanupFalsy(headers)).forEach(([k, v]) => setHeader(k, v));
	Object.entries(fetchOptions.headers || {}).forEach(([k, v]) => setHeader(k, v));
	const davResponse = await requestFetch(url, {
		...fetchOptionsWithoutHeaders,
		headers: mergedHeaders,
		body: xmlBody,
		method
	});
	const resText = await davResponse.text();
	if (!davResponse.ok || !((_a = davResponse.headers.get("content-type")) === null || _a === void 0 ? void 0 : _a.includes("xml")) || !parseOutgoing || !resText) {
		const MAX_RAW = 4096;
		const raw = resText.length > MAX_RAW ? `${resText.slice(0, MAX_RAW)}…` : resText;
		return [{
			href: davResponse.url,
			ok: davResponse.ok,
			status: davResponse.status,
			statusText: davResponse.statusText,
			raw
		}];
	}
	let result;
	try {
		result = import_lib.default.xml2js(resText, {
			compact: true,
			trim: true,
			textFn: (value, parentElement) => {
				try {
					const parentOfParent = parentElement._parent;
					const pOpKeys = Object.keys(parentOfParent);
					const keyName = pOpKeys[pOpKeys.length - 1];
					const arrOfKey = parentOfParent[keyName];
					if (arrOfKey.length > 0) {
						const arr = arrOfKey;
						const arrIndex = arrOfKey.length - 1;
						arr[arrIndex] = nativeType(value);
					} else parentOfParent[keyName] = nativeType(value);
				} catch (e) {
					debug$5(e.stack);
				}
			},
			elementNameFn: (attributeName) => camelCase(attributeName.replace(/^.+:/, "")),
			attributesFn: (value) => {
				const newVal = { ...value };
				delete newVal.xmlns;
				return newVal;
			},
			ignoreDeclaration: true
		});
	} catch (e) {
		debug$5(`Failed to parse DAV response XML: ${e.message}`);
		return [{
			href: davResponse.url,
			ok: davResponse.ok,
			status: davResponse.status,
			statusText: davResponse.statusText,
			raw: resText
		}];
	}
	if (!(result === null || result === void 0 ? void 0 : result.multistatus)) return [{
		href: davResponse.url,
		ok: davResponse.ok,
		status: davResponse.status,
		statusText: davResponse.statusText,
		raw: result
	}];
	return (Array.isArray(result.multistatus.response) ? result.multistatus.response : [result.multistatus.response]).map((responseBody) => {
		var _a, _b;
		const statusRegex = /^\S+\s(?<status>\d+)\s(?<statusText>.+)$/;
		if (!responseBody) return {
			status: davResponse.status,
			statusText: davResponse.statusText,
			ok: davResponse.ok
		};
		const matchArr = statusRegex.exec(responseBody.status);
		const status = (matchArr === null || matchArr === void 0 ? void 0 : matchArr.groups) ? Number.parseInt(matchArr.groups.status, 10) : davResponse.status;
		return {
			raw: result,
			href: responseBody.href,
			status,
			statusText: (_b = (_a = matchArr === null || matchArr === void 0 ? void 0 : matchArr.groups) === null || _a === void 0 ? void 0 : _a.statusText) !== null && _b !== void 0 ? _b : davResponse.statusText,
			ok: status >= 200 && status < 300,
			error: responseBody.error,
			responsedescription: responseBody.responsedescription,
			props: (Array.isArray(responseBody.propstat) ? responseBody.propstat : [responseBody.propstat]).reduce((prev, curr) => {
				return {
					...prev,
					...curr === null || curr === void 0 ? void 0 : curr.prop
				};
			}, {})
		};
	});
};
const propfind = async (params) => {
	const { url, props, depth, headers, headersToExclude, fetchOptions = {}, fetch: fetchOverride } = params;
	return davRequest({
		url,
		init: {
			method: "PROPFIND",
			headers: excludeHeaders(cleanupFalsy({
				depth,
				...headers
			}), headersToExclude),
			namespace: DAVNamespaceShort.DAV,
			body: { propfind: {
				_attributes: getDAVAttribute([
					DAVNamespace.CALDAV,
					DAVNamespace.CALDAV_APPLE,
					DAVNamespace.CALENDAR_SERVER,
					DAVNamespace.CARDDAV,
					DAVNamespace.DAV
				]),
				prop: props
			} }
		},
		fetchOptions,
		fetch: fetchOverride
	});
};
const createObject = async (params) => {
	const { url, data, headers, headersToExclude, fetchOptions = {}, fetch: fetchOverride } = params;
	return (fetchOverride !== null && fetchOverride !== void 0 ? fetchOverride : fetch)(url, {
		method: "PUT",
		body: data,
		headers: excludeHeaders(headers, headersToExclude),
		...fetchOptions
	});
};
const updateObject = async (params) => {
	const { url, data, etag, headers, headersToExclude, fetchOptions = {}, fetch: fetchOverride } = params;
	return (fetchOverride !== null && fetchOverride !== void 0 ? fetchOverride : fetch)(url, {
		method: "PUT",
		body: data,
		headers: excludeHeaders(cleanupFalsy({
			"If-Match": etag,
			...headers
		}), headersToExclude),
		...fetchOptions
	});
};
const deleteObject = async (params) => {
	const { url, headers, etag, headersToExclude, fetchOptions = {}, fetch: fetchOverride } = params;
	return (fetchOverride !== null && fetchOverride !== void 0 ? fetchOverride : fetch)(url, {
		method: "DELETE",
		headers: excludeHeaders(cleanupFalsy({
			"If-Match": etag,
			...headers
		}), headersToExclude),
		...fetchOptions
	});
};
var request = /* @__PURE__ */ Object.freeze({
	__proto__: null,
	createObject,
	davRequest,
	deleteObject,
	propfind,
	updateObject
});
function hasFields(obj, fields) {
	const inObj = (object) => fields.every((f) => object[f]);
	if (Array.isArray(obj)) return obj.every((o) => inObj(o));
	return inObj(obj);
}
const findMissingFieldNames = (obj, fields) => fields.reduce((prev, curr) => obj[curr] ? prev : `${prev.length ? `${prev},` : ""}${curr.toString()}`, "");
const debug$4 = (0, import_src.default)("tsdav:collection");
const collectionQuery = async (params) => {
	const { url, body, depth, defaultNamespace = DAVNamespaceShort.DAV, headers, headersToExclude, fetchOptions = {}, fetch: fetchOverride } = params;
	const queryResults = await davRequest({
		url,
		init: {
			method: "REPORT",
			headers: excludeHeaders(cleanupFalsy({
				depth,
				...headers
			}), headersToExclude),
			namespace: defaultNamespace,
			body
		},
		fetchOptions,
		fetch: fetchOverride
	});
	const errorResponse = queryResults.find((res) => !res.ok || res.status && res.status >= 400);
	if (errorResponse) throw new Error(`Collection query failed: ${errorResponse.status} ${errorResponse.statusText}. ${errorResponse.raw ? `Raw response: ${errorResponse.raw}` : ""}`);
	if (queryResults.length === 1 && !queryResults[0].raw && queryResults[0].status && queryResults[0].status < 300) return [];
	return queryResults;
};
const makeCollection = async (params) => {
	const { url, props, depth, headers, headersToExclude, fetchOptions = {}, fetch: fetchOverride } = params;
	return davRequest({
		url,
		init: {
			method: "MKCOL",
			headers: excludeHeaders(cleanupFalsy({
				depth,
				...headers
			}), headersToExclude),
			namespace: DAVNamespaceShort.DAV,
			body: props ? { mkcol: { set: { prop: props } } } : void 0
		},
		fetchOptions,
		fetch: fetchOverride
	});
};
const supportedReportSet = async (params) => {
	var _a, _b, _c;
	const { collection, headers, headersToExclude, fetchOptions = {}, fetch: fetchOverride } = params;
	const supportedReport = (_c = (_b = (_a = (await propfind({
		url: collection.url,
		props: { [`${DAVNamespaceShort.DAV}:supported-report-set`]: {} },
		depth: "0",
		headers: excludeHeaders(headers, headersToExclude),
		fetchOptions,
		fetch: fetchOverride
	}))[0]) === null || _a === void 0 ? void 0 : _a.props) === null || _b === void 0 ? void 0 : _b.supportedReportSet) === null || _c === void 0 ? void 0 : _c.supportedReport;
	if (!supportedReport) return [];
	return (Array.isArray(supportedReport) ? supportedReport : [supportedReport]).map((sr) => (sr === null || sr === void 0 ? void 0 : sr.report) ? Object.keys(sr.report)[0] : void 0).filter((name) => typeof name === "string" && name.length > 0);
};
const isCollectionDirty = async (params) => {
	var _a, _b, _c;
	const { collection, headers, headersToExclude, fetchOptions = {}, fetch: fetchOverride } = params;
	const res = (await propfind({
		url: collection.url,
		props: { [`${DAVNamespaceShort.CALENDAR_SERVER}:getctag`]: {} },
		depth: "0",
		headers: excludeHeaders(headers, headersToExclude),
		fetchOptions,
		fetch: fetchOverride
	})).filter((r) => urlContains(collection.url, r.href))[0];
	if (!res) throw new Error("Collection does not exist on server");
	return {
		isDirty: `${collection.ctag}` !== `${(_a = res.props) === null || _a === void 0 ? void 0 : _a.getctag}`,
		newCtag: (_c = (_b = res.props) === null || _b === void 0 ? void 0 : _b.getctag) === null || _c === void 0 ? void 0 : _c.toString()
	};
};
/**
* This is for webdav sync-collection only
*/
const syncCollection = (params) => {
	const { url, props, headers, syncLevel, syncToken, headersToExclude, fetchOptions, fetch: fetchOverride } = params;
	return davRequest({
		url,
		init: {
			method: "REPORT",
			namespace: DAVNamespaceShort.DAV,
			headers: excludeHeaders({ ...headers }, headersToExclude),
			body: { "sync-collection": {
				_attributes: getDAVAttribute([
					DAVNamespace.CALDAV,
					DAVNamespace.CARDDAV,
					DAVNamespace.DAV
				]),
				"sync-level": syncLevel,
				"sync-token": syncToken,
				[`${DAVNamespaceShort.DAV}:prop`]: props
			} }
		},
		fetchOptions,
		fetch: fetchOverride
	});
};
/** remote collection to local */
const smartCollectionSync = async (params) => {
	var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
	const { collection, method, headers, headersToExclude, account, detailedResult, fetchOptions = {}, fetch: fetchOverride } = params;
	const requiredFields = ["accountType", "homeUrl"];
	if (!account || !hasFields(account, requiredFields)) {
		if (!account) throw new Error("no account for smartCollectionSync");
		throw new Error(`account must have ${findMissingFieldNames(account, requiredFields)} before smartCollectionSync`);
	}
	const syncMethod = method !== null && method !== void 0 ? method : ((_a = collection.reports) === null || _a === void 0 ? void 0 : _a.includes("syncCollection")) ? "webdav" : "basic";
	debug$4(`smart collection sync with type ${account.accountType} and method ${syncMethod}`);
	if (syncMethod === "webdav") {
		const result = await syncCollection({
			url: collection.url,
			props: {
				[`${DAVNamespaceShort.DAV}:getetag`]: {},
				[`${account.accountType === "caldav" ? DAVNamespaceShort.CALDAV : DAVNamespaceShort.CARDDAV}:${account.accountType === "caldav" ? "calendar-data" : "address-data"}`]: {},
				[`${DAVNamespaceShort.DAV}:displayname`]: {}
			},
			syncLevel: 1,
			syncToken: collection.syncToken,
			headers: excludeHeaders(headers, headersToExclude),
			fetchOptions,
			fetch: fetchOverride
		});
		const objectResponses = result.filter((r) => {
			var _a;
			const extName = account.accountType === "caldav" ? ".ics" : ".vcf";
			return ((_a = r.href) === null || _a === void 0 ? void 0 : _a.slice(-4)) === extName;
		});
		const changedObjectUrls = objectResponses.filter((o) => o.status !== 404).map((r) => r.href);
		const deletedObjectUrls = objectResponses.filter((o) => o.status === 404).map((r) => r.href);
		const remoteObjects = (changedObjectUrls.length ? (_c = await ((_b = collection.objectMultiGet) === null || _b === void 0 ? void 0 : _b.call(collection, {
			url: collection.url,
			props: {
				[`${DAVNamespaceShort.DAV}:getetag`]: {},
				[`${account.accountType === "caldav" ? DAVNamespaceShort.CALDAV : DAVNamespaceShort.CARDDAV}:${account.accountType === "caldav" ? "calendar-data" : "address-data"}`]: {}
			},
			objectUrls: changedObjectUrls,
			depth: "1",
			headers: excludeHeaders(headers, headersToExclude),
			fetchOptions,
			fetch: fetchOverride
		}))) !== null && _c !== void 0 ? _c : [] : []).map((res) => {
			var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
			return {
				url: (_a = res.href) !== null && _a !== void 0 ? _a : "",
				etag: (_b = res.props) === null || _b === void 0 ? void 0 : _b.getetag,
				data: (account === null || account === void 0 ? void 0 : account.accountType) === "caldav" ? (_e = (_d = (_c = res.props) === null || _c === void 0 ? void 0 : _c.calendarData) === null || _d === void 0 ? void 0 : _d._cdata) !== null && _e !== void 0 ? _e : (_f = res.props) === null || _f === void 0 ? void 0 : _f.calendarData : (_j = (_h = (_g = res.props) === null || _g === void 0 ? void 0 : _g.addressData) === null || _h === void 0 ? void 0 : _h._cdata) !== null && _j !== void 0 ? _j : (_k = res.props) === null || _k === void 0 ? void 0 : _k.addressData
			};
		});
		const localObjects = (_d = collection.objects) !== null && _d !== void 0 ? _d : [];
		const created = remoteObjects.filter((o) => localObjects.every((lo) => !urlContains(lo.url, o.url)));
		const updated = localObjects.reduce((prev, curr) => {
			const found = remoteObjects.find((ro) => urlContains(ro.url, curr.url));
			if (found && found.etag && found.etag !== curr.etag) return [...prev, found];
			return prev;
		}, []);
		const deleted = deletedObjectUrls.map((o) => ({
			url: o,
			etag: ""
		}));
		const unchanged = localObjects.filter((lo) => remoteObjects.some((ro) => urlContains(lo.url, ro.url) && ro.etag === lo.etag));
		return {
			...collection,
			objects: detailedResult ? {
				created,
				updated,
				deleted
			} : [
				...unchanged,
				...created,
				...updated
			],
			syncToken: (_h = (_g = (_f = (_e = result[0]) === null || _e === void 0 ? void 0 : _e.raw) === null || _f === void 0 ? void 0 : _f.multistatus) === null || _g === void 0 ? void 0 : _g.syncToken) !== null && _h !== void 0 ? _h : collection.syncToken
		};
	}
	if (syncMethod === "basic") {
		const { isDirty, newCtag } = await isCollectionDirty({
			collection,
			headers: excludeHeaders(headers, headersToExclude),
			fetchOptions,
			fetch: fetchOverride
		});
		if (!isDirty) return detailedResult ? {
			...collection,
			objects: {
				created: [],
				updated: [],
				deleted: []
			}
		} : collection;
		const localObjects = (_j = collection.objects) !== null && _j !== void 0 ? _j : [];
		const remoteObjects = (_l = await ((_k = collection.fetchObjects) === null || _k === void 0 ? void 0 : _k.call(collection, {
			collection,
			headers: excludeHeaders(headers, headersToExclude),
			fetchOptions,
			fetch: fetchOverride
		}))) !== null && _l !== void 0 ? _l : [];
		const created = remoteObjects.filter((ro) => localObjects.every((lo) => !urlContains(lo.url, ro.url)));
		const updated = localObjects.reduce((prev, curr) => {
			const found = remoteObjects.find((ro) => urlContains(ro.url, curr.url));
			if (found && found.etag && found.etag !== curr.etag) return [...prev, found];
			return prev;
		}, []);
		const deleted = localObjects.filter((cal) => remoteObjects.every((ro) => !urlContains(ro.url, cal.url)));
		const unchanged = localObjects.filter((lo) => remoteObjects.some((ro) => urlContains(lo.url, ro.url) && ro.etag === lo.etag));
		return {
			...collection,
			objects: detailedResult ? {
				created,
				updated,
				deleted
			} : [
				...unchanged,
				...created,
				...updated
			],
			ctag: newCtag
		};
	}
	return detailedResult ? {
		...collection,
		objects: {
			created: [],
			updated: [],
			deleted: []
		}
	} : collection;
};
const smartCollectionSyncDetailed = async (params) => smartCollectionSync({
	...params,
	detailedResult: true
});
var collection = /* @__PURE__ */ Object.freeze({
	__proto__: null,
	collectionQuery,
	isCollectionDirty,
	makeCollection,
	smartCollectionSync,
	smartCollectionSyncDetailed,
	supportedReportSet,
	syncCollection
});
const debug$3 = (0, import_src.default)("tsdav:addressBook");
const addressBookQuery = async (params) => {
	const { url, props, filters, depth, headers, headersToExclude, fetchOptions = {}, fetch: fetchOverride } = params;
	return collectionQuery({
		url,
		body: { "addressbook-query": cleanupFalsy({
			_attributes: getDAVAttribute([DAVNamespace.CARDDAV, DAVNamespace.DAV]),
			[`${DAVNamespaceShort.DAV}:prop`]: props,
			filter: filters !== null && filters !== void 0 ? filters : { "prop-filter": { _attributes: { name: "FN" } } }
		}) },
		defaultNamespace: DAVNamespaceShort.CARDDAV,
		depth,
		headers: excludeHeaders(headers, headersToExclude),
		fetchOptions,
		fetch: fetchOverride
	});
};
const addressBookMultiGet = async (params) => {
	const { url, props, objectUrls, depth, headers, headersToExclude, fetchOptions = {}, fetch: fetchOverride } = params;
	return collectionQuery({
		url,
		body: { "addressbook-multiget": cleanupFalsy({
			_attributes: getDAVAttribute([DAVNamespace.DAV, DAVNamespace.CARDDAV]),
			[`${DAVNamespaceShort.DAV}:prop`]: props,
			[`${DAVNamespaceShort.DAV}:href`]: objectUrls
		}) },
		defaultNamespace: DAVNamespaceShort.CARDDAV,
		depth,
		headers: excludeHeaders(headers, headersToExclude),
		fetchOptions,
		fetch: fetchOverride
	});
};
const fetchAddressBooks = async (params) => {
	const { account, headers, props: customProps, headersToExclude, fetchOptions = {}, fetch: fetchOverride } = params !== null && params !== void 0 ? params : {};
	const requiredFields = ["homeUrl", "rootUrl"];
	if (!account || !hasFields(account, requiredFields)) {
		if (!account) throw new Error("no account for fetchAddressBooks");
		throw new Error(`account must have ${findMissingFieldNames(account, requiredFields)} before fetchAddressBooks`);
	}
	const res = await propfind({
		url: account.homeUrl,
		props: customProps !== null && customProps !== void 0 ? customProps : {
			[`${DAVNamespaceShort.DAV}:displayname`]: {},
			[`${DAVNamespaceShort.CALENDAR_SERVER}:getctag`]: {},
			[`${DAVNamespaceShort.DAV}:resourcetype`]: {},
			[`${DAVNamespaceShort.DAV}:sync-token`]: {}
		},
		depth: "1",
		headers: excludeHeaders(headers, headersToExclude),
		fetchOptions,
		fetch: fetchOverride
	});
	return Promise.all(res.filter((r) => {
		var _a, _b;
		return Object.keys((_b = (_a = r.props) === null || _a === void 0 ? void 0 : _a.resourcetype) !== null && _b !== void 0 ? _b : {}).includes("addressbook");
	}).map((rs) => {
		var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
		const displayName = (_c = (_b = (_a = rs.props) === null || _a === void 0 ? void 0 : _a.displayname) === null || _b === void 0 ? void 0 : _b._cdata) !== null && _c !== void 0 ? _c : (_d = rs.props) === null || _d === void 0 ? void 0 : _d.displayname;
		debug$3(`Found address book named ${typeof displayName === "string" ? displayName : ""},
             props: ${JSON.stringify(rs.props)}`);
		return {
			url: new URL((_e = rs.href) !== null && _e !== void 0 ? _e : "", (_f = account.rootUrl) !== null && _f !== void 0 ? _f : "").href,
			ctag: (_g = rs.props) === null || _g === void 0 ? void 0 : _g.getctag,
			displayName: typeof displayName === "string" ? displayName : "",
			resourcetype: Object.keys((_j = (_h = rs.props) === null || _h === void 0 ? void 0 : _h.resourcetype) !== null && _j !== void 0 ? _j : {}),
			syncToken: (_k = rs.props) === null || _k === void 0 ? void 0 : _k.syncToken
		};
	}).map(async (addr) => ({
		...addr,
		reports: await supportedReportSet({
			collection: addr,
			headers: excludeHeaders(headers, headersToExclude),
			fetchOptions,
			fetch: fetchOverride
		})
	})));
};
const fetchVCards = async (params) => {
	const { addressBook, headers, objectUrls, headersToExclude, urlFilter = (url) => Boolean(url), useMultiGet = true, fetchOptions = {}, fetch: fetchOverride } = params;
	debug$3(`Fetching vcards from ${addressBook === null || addressBook === void 0 ? void 0 : addressBook.url}`);
	const requiredFields = ["url"];
	if (!addressBook || !hasFields(addressBook, requiredFields)) {
		if (!addressBook) throw new Error("cannot fetchVCards for undefined addressBook");
		throw new Error(`addressBook must have ${findMissingFieldNames(addressBook, requiredFields)} before fetchVCards`);
	}
	const vcardUrls = (objectUrls !== null && objectUrls !== void 0 ? objectUrls : (await addressBookQuery({
		url: addressBook.url,
		props: { [`${DAVNamespaceShort.DAV}:getetag`]: {} },
		depth: "1",
		headers: excludeHeaders(headers, headersToExclude),
		fetchOptions,
		fetch: fetchOverride
	})).map((res) => {
		var _a;
		return (_a = res.href) !== null && _a !== void 0 ? _a : "";
	})).map((url) => url.startsWith("http") || !url ? url : new URL(url, addressBook.url).href).filter((url) => url && !urlEquals(url, addressBook.url)).filter(urlFilter).map((url) => new URL(url).pathname);
	let vCardResults = [];
	if (vcardUrls.length > 0) if (useMultiGet) vCardResults = await addressBookMultiGet({
		url: addressBook.url,
		props: {
			[`${DAVNamespaceShort.DAV}:getetag`]: {},
			[`${DAVNamespaceShort.CARDDAV}:address-data`]: {}
		},
		objectUrls: vcardUrls,
		depth: "1",
		headers: excludeHeaders(headers, headersToExclude),
		fetchOptions,
		fetch: fetchOverride
	});
	else vCardResults = await addressBookQuery({
		url: addressBook.url,
		props: {
			[`${DAVNamespaceShort.DAV}:getetag`]: {},
			[`${DAVNamespaceShort.CARDDAV}:address-data`]: {}
		},
		depth: "1",
		headers: excludeHeaders(headers, headersToExclude),
		fetchOptions,
		fetch: fetchOverride
	});
	return vCardResults.map((res) => {
		var _a, _b, _c, _d, _e, _f;
		return {
			url: new URL((_a = res.href) !== null && _a !== void 0 ? _a : "", addressBook.url).href,
			etag: (_b = res.props) === null || _b === void 0 ? void 0 : _b.getetag,
			data: (_e = (_d = (_c = res.props) === null || _c === void 0 ? void 0 : _c.addressData) === null || _d === void 0 ? void 0 : _d._cdata) !== null && _e !== void 0 ? _e : (_f = res.props) === null || _f === void 0 ? void 0 : _f.addressData
		};
	});
};
const createVCard = async (params) => {
	const { addressBook, vCardString, filename, headers, headersToExclude, fetchOptions = {}, fetch: fetchOverride } = params;
	return createObject({
		url: new URL(filename, addressBook.url).href,
		data: vCardString,
		headers: excludeHeaders({
			"content-type": "text/vcard; charset=utf-8",
			"If-None-Match": "*",
			...headers
		}, headersToExclude),
		fetchOptions,
		fetch: fetchOverride
	});
};
const updateVCard = async (params) => {
	const { vCard, headers, headersToExclude, fetchOptions = {}, fetch: fetchOverride } = params;
	return updateObject({
		url: vCard.url,
		data: vCard.data,
		etag: vCard.etag,
		headers: excludeHeaders({
			"content-type": "text/vcard; charset=utf-8",
			...headers
		}, headersToExclude),
		fetchOptions,
		fetch: fetchOverride
	});
};
const deleteVCard = async (params) => {
	const { vCard, headers, headersToExclude, fetchOptions = {}, fetch: fetchOverride } = params;
	return deleteObject({
		url: vCard.url,
		etag: vCard.etag,
		headers: excludeHeaders(headers, headersToExclude),
		fetchOptions,
		fetch: fetchOverride
	});
};
var addressBook = /* @__PURE__ */ Object.freeze({
	__proto__: null,
	addressBookMultiGet,
	addressBookQuery,
	createVCard,
	deleteVCard,
	fetchAddressBooks,
	fetchVCards,
	updateVCard
});
const debug$2 = (0, import_src.default)("tsdav:calendar");
const ISO_8601 = /^\d{4}(-\d\d(-\d\d(T\d\d:\d\d(:\d\d)?(\.\d+)?(([+-]\d\d:\d\d)|Z)?)?)?)?$/i;
const ISO_8601_FULL = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?(([+-]\d\d:\d\d)|Z)?$/i;
/**
* Validate a time-range input: both endpoints must be ISO-8601 shaped AND
* parse to a real Date (so values like `0000-13-99` get rejected).
*/
const validateTimeRange = (timeRange) => {
	const { start, end } = timeRange;
	if (!(ISO_8601.test(start) && ISO_8601.test(end) || ISO_8601_FULL.test(start) && ISO_8601_FULL.test(end))) throw new Error("invalid timeRange format, not in ISO8601");
	if (Number.isNaN(new Date(start).getTime()) || Number.isNaN(new Date(end).getTime())) throw new Error("invalid timeRange: start or end is not a valid date");
};
const extractComponentNames = (compSet) => {
	var _a;
	let names = [];
	if (Array.isArray(compSet)) names = compSet.map((sc) => {
		var _a;
		return (_a = sc === null || sc === void 0 ? void 0 : sc._attributes) === null || _a === void 0 ? void 0 : _a.name;
	});
	else if (compSet && typeof compSet === "object") names = [(_a = compSet._attributes) === null || _a === void 0 ? void 0 : _a.name];
	return names.filter((n) => typeof n === "string" && n.length > 0);
};
const fetchCalendarUserAddresses = async (params) => {
	var _a, _b;
	const { account, headers, headersToExclude, fetchOptions = {}, fetch: fetchOverride } = params;
	const requiredFields = ["principalUrl", "rootUrl"];
	if (!hasFields(account, requiredFields)) throw new Error(`account must have ${findMissingFieldNames(account, requiredFields)} before fetchUserAddresses`);
	debug$2(`Fetch user addresses from ${account.principalUrl}`);
	const matched = (await propfind({
		url: account.principalUrl,
		props: { [`${DAVNamespaceShort.CALDAV}:calendar-user-address-set`]: {} },
		depth: "0",
		headers: excludeHeaders(headers, headersToExclude),
		fetchOptions,
		fetch: fetchOverride
	})).find((r) => urlContains(account.principalUrl, r.href));
	if (!matched || !matched.ok) throw new Error("cannot find calendarUserAddresses");
	const rawHrefs = (_b = (_a = matched === null || matched === void 0 ? void 0 : matched.props) === null || _a === void 0 ? void 0 : _a.calendarUserAddressSet) === null || _b === void 0 ? void 0 : _b.href;
	let hrefArray = [];
	if (Array.isArray(rawHrefs)) hrefArray = rawHrefs;
	else if (rawHrefs) hrefArray = [rawHrefs];
	const addresses = hrefArray.filter((h) => typeof h === "string" && h.length > 0);
	debug$2(`Fetched calendar user addresses ${addresses}`);
	return addresses;
};
const calendarQuery = async (params) => {
	const { url, props, filters, timezone, depth, headers, headersToExclude, fetchOptions = {}, fetch: fetchOverride } = params;
	return collectionQuery({
		url,
		body: { "calendar-query": cleanupFalsy({
			_attributes: getDAVAttribute([
				DAVNamespace.CALDAV,
				DAVNamespace.CALENDAR_SERVER,
				DAVNamespace.CALDAV_APPLE,
				DAVNamespace.DAV
			]),
			[`${DAVNamespaceShort.DAV}:prop`]: props,
			filter: filters,
			timezone
		}) },
		defaultNamespace: DAVNamespaceShort.CALDAV,
		depth,
		headers: excludeHeaders(headers, headersToExclude),
		fetchOptions,
		fetch: fetchOverride
	});
};
const calendarMultiGet = async (params) => {
	const { url, props, objectUrls, filters, timezone, depth, headers, headersToExclude, fetchOptions = {}, fetch: fetchOverride } = params;
	return collectionQuery({
		url,
		body: { "calendar-multiget": cleanupFalsy({
			_attributes: getDAVAttribute([DAVNamespace.DAV, DAVNamespace.CALDAV]),
			[`${DAVNamespaceShort.DAV}:prop`]: props,
			[`${DAVNamespaceShort.DAV}:href`]: objectUrls,
			filter: filters,
			timezone
		}) },
		defaultNamespace: DAVNamespaceShort.CALDAV,
		depth,
		headers: excludeHeaders(headers, headersToExclude),
		fetchOptions,
		fetch: fetchOverride
	});
};
const makeCalendar = async (params) => {
	const { url, props, depth, headers, headersToExclude, fetchOptions = {}, fetch: fetchOverride } = params;
	return davRequest({
		url,
		init: {
			method: "MKCALENDAR",
			headers: excludeHeaders(cleanupFalsy({
				depth,
				...headers
			}), headersToExclude),
			namespace: DAVNamespaceShort.DAV,
			body: { [`${DAVNamespaceShort.CALDAV}:mkcalendar`]: {
				_attributes: getDAVAttribute([
					DAVNamespace.DAV,
					DAVNamespace.CALDAV,
					DAVNamespace.CALDAV_APPLE
				]),
				set: { prop: props }
			} }
		},
		fetchOptions,
		fetch: fetchOverride
	});
};
const fetchCalendars = async (params) => {
	const { headers, account, props: customProps, projectedProps, headersToExclude, fetchOptions = {}, fetch: fetchOverride } = params !== null && params !== void 0 ? params : {};
	const requiredFields = ["homeUrl", "rootUrl"];
	if (!account || !hasFields(account, requiredFields)) {
		if (!account) throw new Error("no account for fetchCalendars");
		throw new Error(`account must have ${findMissingFieldNames(account, requiredFields)} before fetchCalendars`);
	}
	const res = await propfind({
		url: account.homeUrl,
		props: customProps !== null && customProps !== void 0 ? customProps : {
			[`${DAVNamespaceShort.CALDAV}:calendar-description`]: {},
			[`${DAVNamespaceShort.CALDAV}:calendar-timezone`]: {},
			[`${DAVNamespaceShort.DAV}:displayname`]: {},
			[`${DAVNamespaceShort.CALDAV_APPLE}:calendar-color`]: {},
			[`${DAVNamespaceShort.CALENDAR_SERVER}:getctag`]: {},
			[`${DAVNamespaceShort.DAV}:resourcetype`]: {},
			[`${DAVNamespaceShort.CALDAV}:supported-calendar-component-set`]: {},
			[`${DAVNamespaceShort.DAV}:sync-token`]: {}
		},
		depth: "1",
		headers: excludeHeaders(headers, headersToExclude),
		fetchOptions,
		fetch: fetchOverride
	});
	return Promise.all(res.filter((r) => {
		var _a, _b;
		return Object.keys((_b = (_a = r.props) === null || _a === void 0 ? void 0 : _a.resourcetype) !== null && _b !== void 0 ? _b : {}).includes("calendar");
	}).filter((rc) => {
		var _a, _b;
		const components = extractComponentNames((_b = (_a = rc.props) === null || _a === void 0 ? void 0 : _a.supportedCalendarComponentSet) === null || _b === void 0 ? void 0 : _b.comp);
		return components.length === 0 || components.some((c) => Object.values(ICALObjects).includes(c));
	}).map((rs) => {
		var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r;
		const description = (_a = rs.props) === null || _a === void 0 ? void 0 : _a.calendarDescription;
		const timezone = (_b = rs.props) === null || _b === void 0 ? void 0 : _b.calendarTimezone;
		const compSet = (_d = (_c = rs.props) === null || _c === void 0 ? void 0 : _c.supportedCalendarComponentSet) === null || _d === void 0 ? void 0 : _d.comp;
		const projectedEntries = Object.entries((_e = rs.props) !== null && _e !== void 0 ? _e : {}).filter(([key]) => projectedProps === null || projectedProps === void 0 ? void 0 : projectedProps[key]);
		return {
			description: typeof description === "string" ? description : "",
			timezone: typeof timezone === "string" ? timezone : "",
			url: new URL((_f = rs.href) !== null && _f !== void 0 ? _f : "", (_g = account.rootUrl) !== null && _g !== void 0 ? _g : "").href,
			ctag: (_h = rs.props) === null || _h === void 0 ? void 0 : _h.getctag,
			calendarColor: (_j = rs.props) === null || _j === void 0 ? void 0 : _j.calendarColor,
			displayName: (_m = (_l = (_k = rs.props) === null || _k === void 0 ? void 0 : _k.displayname) === null || _l === void 0 ? void 0 : _l._cdata) !== null && _m !== void 0 ? _m : (_o = rs.props) === null || _o === void 0 ? void 0 : _o.displayname,
			components: extractComponentNames(compSet),
			resourcetype: Object.keys((_q = (_p = rs.props) === null || _p === void 0 ? void 0 : _p.resourcetype) !== null && _q !== void 0 ? _q : {}),
			syncToken: (_r = rs.props) === null || _r === void 0 ? void 0 : _r.syncToken,
			...projectedProps && projectedEntries.length > 0 ? { projectedProps: Object.fromEntries(projectedEntries) } : {}
		};
	}).map(async (cal) => ({
		...cal,
		reports: await supportedReportSet({
			collection: cal,
			headers: excludeHeaders(headers, headersToExclude),
			fetchOptions,
			fetch: fetchOverride
		})
	})));
};
const fetchCalendarObjects = async (params) => {
	const { calendar, objectUrls, filters: customFilters, timeRange, headers, expand, urlFilter = (url) => Boolean(url === null || url === void 0 ? void 0 : url.includes(".ics")), useMultiGet = true, headersToExclude, fetchOptions = {}, fetch: fetchOverride } = params;
	if (timeRange) validateTimeRange(timeRange);
	debug$2(`Fetching calendar objects from ${calendar === null || calendar === void 0 ? void 0 : calendar.url}`);
	const requiredFields = ["url"];
	if (!calendar || !hasFields(calendar, requiredFields)) {
		if (!calendar) throw new Error("cannot fetchCalendarObjects for undefined calendar");
		throw new Error(`calendar must have ${findMissingFieldNames(calendar, requiredFields)} before fetchCalendarObjects`);
	}
	const filters = customFilters !== null && customFilters !== void 0 ? customFilters : [{ "comp-filter": {
		_attributes: { name: "VCALENDAR" },
		"comp-filter": {
			_attributes: { name: "VEVENT" },
			...timeRange ? { "time-range": { _attributes: {
				start: `${new Date(timeRange.start).toISOString().slice(0, 19).replace(/[-:.]/g, "")}Z`,
				end: `${new Date(timeRange.end).toISOString().slice(0, 19).replace(/[-:.]/g, "")}Z`
			} } } : {}
		}
	} }];
	let initialResponses = [];
	const calendarObjectUrls = (objectUrls !== null && objectUrls !== void 0 ? objectUrls : (initialResponses = await calendarQuery({
		url: calendar.url,
		props: {
			[`${DAVNamespaceShort.DAV}:getetag`]: {},
			...expand && timeRange ? { [`${DAVNamespaceShort.CALDAV}:calendar-data`]: { [`${DAVNamespaceShort.CALDAV}:expand`]: { _attributes: {
				start: `${new Date(timeRange.start).toISOString().slice(0, 19).replace(/[-:.]/g, "")}Z`,
				end: `${new Date(timeRange.end).toISOString().slice(0, 19).replace(/[-:.]/g, "")}Z`
			} } } } : {}
		},
		filters,
		depth: "1",
		headers: excludeHeaders(headers, headersToExclude),
		fetchOptions,
		fetch: fetchOverride
	})).map((res) => {
		var _a;
		return (_a = res.href) !== null && _a !== void 0 ? _a : "";
	})).map((url) => url.startsWith("http") || !url ? url : new URL(url, calendar.url).href).filter(urlFilter).map((url) => new URL(url).pathname);
	let calendarObjectResults = [];
	if (calendarObjectUrls.length > 0) if (expand && !objectUrls) calendarObjectResults = initialResponses.filter((res) => {
		var _a, _b;
		const fullUrl = ((_a = res.href) !== null && _a !== void 0 ? _a : "").startsWith("http") ? res.href : new URL((_b = res.href) !== null && _b !== void 0 ? _b : "", calendar.url).href;
		return urlFilter(fullUrl !== null && fullUrl !== void 0 ? fullUrl : "");
	});
	else if (!useMultiGet) calendarObjectResults = await calendarQuery({
		url: calendar.url,
		props: {
			[`${DAVNamespaceShort.DAV}:getetag`]: {},
			[`${DAVNamespaceShort.CALDAV}:calendar-data`]: { ...expand && timeRange ? { [`${DAVNamespaceShort.CALDAV}:expand`]: { _attributes: {
				start: `${new Date(timeRange.start).toISOString().slice(0, 19).replace(/[-:.]/g, "")}Z`,
				end: `${new Date(timeRange.end).toISOString().slice(0, 19).replace(/[-:.]/g, "")}Z`
			} } } : {} }
		},
		filters,
		depth: "1",
		headers: excludeHeaders(headers, headersToExclude),
		fetchOptions,
		fetch: fetchOverride
	});
	else calendarObjectResults = await calendarMultiGet({
		url: calendar.url,
		props: {
			[`${DAVNamespaceShort.DAV}:getetag`]: {},
			[`${DAVNamespaceShort.CALDAV}:calendar-data`]: { ...expand && timeRange ? { [`${DAVNamespaceShort.CALDAV}:expand`]: { _attributes: {
				start: `${new Date(timeRange.start).toISOString().slice(0, 19).replace(/[-:.]/g, "")}Z`,
				end: `${new Date(timeRange.end).toISOString().slice(0, 19).replace(/[-:.]/g, "")}Z`
			} } } : {} }
		},
		objectUrls: calendarObjectUrls,
		depth: "1",
		headers: excludeHeaders(headers, headersToExclude),
		fetchOptions,
		fetch: fetchOverride
	});
	return calendarObjectResults.map((res) => {
		var _a, _b, _c, _d, _e, _f;
		return {
			url: new URL((_a = res.href) !== null && _a !== void 0 ? _a : "", calendar.url).href,
			etag: `${(_b = res.props) === null || _b === void 0 ? void 0 : _b.getetag}`,
			data: (_e = (_d = (_c = res.props) === null || _c === void 0 ? void 0 : _c.calendarData) === null || _d === void 0 ? void 0 : _d._cdata) !== null && _e !== void 0 ? _e : (_f = res.props) === null || _f === void 0 ? void 0 : _f.calendarData
		};
	});
};
const createCalendarObject = async (params) => {
	const { calendar, iCalString, filename, headers, headersToExclude, fetchOptions = {}, fetch: fetchOverride } = params;
	return createObject({
		url: new URL(filename, calendar.url).href,
		data: iCalString,
		headers: excludeHeaders({
			"content-type": "text/calendar; charset=utf-8",
			"If-None-Match": "*",
			...headers
		}, headersToExclude),
		fetchOptions,
		fetch: fetchOverride
	});
};
const updateCalendarObject = async (params) => {
	const { calendarObject, headers, headersToExclude, fetchOptions = {}, fetch: fetchOverride } = params;
	return updateObject({
		url: calendarObject.url,
		data: calendarObject.data,
		etag: calendarObject.etag,
		headers: excludeHeaders({
			"content-type": "text/calendar; charset=utf-8",
			...headers
		}, headersToExclude),
		fetchOptions,
		fetch: fetchOverride
	});
};
const deleteCalendarObject = async (params) => {
	const { calendarObject, headers, headersToExclude, fetchOptions = {}, fetch: fetchOverride } = params;
	return deleteObject({
		url: calendarObject.url,
		etag: calendarObject.etag,
		headers: excludeHeaders(headers, headersToExclude),
		fetchOptions,
		fetch: fetchOverride
	});
};
/**
* Sync remote calendars to local
*/
const syncCalendars = async (params) => {
	var _a;
	const { oldCalendars, account, detailedResult, headers, headersToExclude, fetchOptions = {}, fetch: fetchOverride } = params;
	if (!account) throw new Error("Must have account before syncCalendars");
	const localCalendars = (_a = oldCalendars !== null && oldCalendars !== void 0 ? oldCalendars : account.calendars) !== null && _a !== void 0 ? _a : [];
	const remoteCalendars = await fetchCalendars({
		account,
		headers: excludeHeaders(headers, headersToExclude),
		fetchOptions,
		fetch: fetchOverride
	});
	const created = remoteCalendars.filter((rc) => localCalendars.every((lc) => !urlContains(lc.url, rc.url)));
	debug$2(`new calendars: ${created.map((cc) => cc.displayName)}`);
	const updated = localCalendars.reduce((prev, curr) => {
		const found = remoteCalendars.find((rc) => urlContains(rc.url, curr.url));
		if (found && (found.syncToken && `${found.syncToken}` !== `${curr.syncToken}` || found.ctag && `${found.ctag}` !== `${curr.ctag}`)) return [...prev, found];
		return prev;
	}, []);
	debug$2(`updated calendars: ${updated.map((cc) => cc.displayName)}`);
	const updatedWithObjects = await Promise.all(updated.map(async (u) => {
		return await smartCollectionSync({
			collection: {
				...u,
				objectMultiGet: calendarMultiGet
			},
			method: "webdav",
			headers: excludeHeaders(headers, headersToExclude),
			account,
			fetchOptions,
			fetch: fetchOverride
		});
	}));
	const deleted = localCalendars.filter((cal) => remoteCalendars.every((rc) => !urlContains(rc.url, cal.url)));
	debug$2(`deleted calendars: ${deleted.map((cc) => cc.displayName)}`);
	const unchanged = localCalendars.filter((cal) => remoteCalendars.some((rc) => {
		if (!urlContains(rc.url, cal.url)) return false;
		const syncTokenMatches = !rc.syncToken || `${rc.syncToken}` === `${cal.syncToken}`;
		const ctagMatches = !rc.ctag || `${rc.ctag}` === `${cal.ctag}`;
		return syncTokenMatches && ctagMatches;
	}));
	debug$2(`unchanged calendars: ${unchanged.map((cc) => cc.displayName)}`);
	return detailedResult ? {
		created,
		updated: updatedWithObjects,
		deleted
	} : [
		...unchanged,
		...created,
		...updatedWithObjects
	];
};
const syncCalendarsDetailed = async (params) => syncCalendars({
	...params,
	detailedResult: true
});
const freeBusyQuery = async (params) => {
	const { url, timeRange, depth, headers, headersToExclude, fetchOptions = {}, fetch: fetchOverride } = params;
	if (!timeRange) throw new Error("timeRange is required");
	validateTimeRange(timeRange);
	return (await collectionQuery({
		url,
		body: { "free-busy-query": cleanupFalsy({
			_attributes: getDAVAttribute([DAVNamespace.CALDAV]),
			[`${DAVNamespaceShort.CALDAV}:time-range`]: { _attributes: {
				start: `${new Date(timeRange.start).toISOString().slice(0, 19).replace(/[-:.]/g, "")}Z`,
				end: `${new Date(timeRange.end).toISOString().slice(0, 19).replace(/[-:.]/g, "")}Z`
			} }
		}) },
		defaultNamespace: DAVNamespaceShort.CALDAV,
		depth,
		headers: excludeHeaders(headers, headersToExclude),
		fetchOptions,
		fetch: fetchOverride
	}))[0];
};
var calendar = /* @__PURE__ */ Object.freeze({
	__proto__: null,
	calendarMultiGet,
	calendarQuery,
	createCalendarObject,
	deleteCalendarObject,
	fetchCalendarObjects,
	fetchCalendarUserAddresses,
	fetchCalendars,
	freeBusyQuery,
	makeCalendar,
	syncCalendars,
	syncCalendarsDetailed,
	updateCalendarObject
});
const debug$1 = (0, import_src.default)("tsdav:account");
const getCandidateRootUrls = (serverUrl, discoveredRootUrl) => {
	const candidates = [
		discoveredRootUrl,
		serverUrl,
		new URL("/", serverUrl).href
	];
	return candidates.filter((url, index) => candidates.indexOf(url) === index);
};
const serviceDiscovery = async (params) => {
	var _a;
	debug$1("Service discovery...");
	const { account, headers, headersToExclude, fetchOptions = {}, fetch: fetchOverride } = params;
	const requestFetch = fetchOverride !== null && fetchOverride !== void 0 ? fetchOverride : fetch;
	const endpoint = new URL(account.serverUrl);
	const uri = new URL(`/.well-known/${account.accountType}`, endpoint);
	uri.protocol = (_a = endpoint.protocol) !== null && _a !== void 0 ? _a : "http";
	const extractRedirect = (response) => {
		var _a;
		if (response.status >= 300 && response.status < 400) {
			const location = response.headers.get("Location");
			if (typeof location === "string" && location.length) {
				debug$1(`Service discovery redirected to ${location}`);
				const hasExplicitScheme = /^[a-z][a-z0-9+.-]*:/i.test(location);
				const serviceURL = new URL(location, endpoint);
				if (serviceURL.hostname === uri.hostname && uri.port && !serviceURL.port) serviceURL.port = uri.port;
				if (!hasExplicitScheme) serviceURL.protocol = (_a = endpoint.protocol) !== null && _a !== void 0 ? _a : "http";
				return serviceURL.href;
			}
		}
	};
	try {
		const redirectUrl = extractRedirect(await requestFetch(uri.href, {
			...fetchOptions,
			method: "PROPFIND",
			headers: {
				...excludeHeaders(headers, headersToExclude),
				"Content-Type": "text/xml;charset=UTF-8"
			},
			body: `<?xml version="1.0" encoding="utf-8" ?>
<d:propfind xmlns:d="DAV:">
  <d:prop>
    <d:resourcetype/>
  </d:prop>
</d:propfind>`,
			redirect: "manual"
		}));
		if (redirectUrl) return redirectUrl;
	} catch (err) {
		debug$1(`Service discovery PROPFIND failed: ${err.stack}`);
	}
	try {
		const redirectUrl = extractRedirect(await requestFetch(uri.href, {
			...fetchOptions,
			method: "GET",
			headers: excludeHeaders(headers, headersToExclude),
			redirect: "manual"
		}));
		if (redirectUrl) return redirectUrl;
	} catch (err) {
		debug$1(`Service discovery GET failed: ${err.stack}`);
	}
	return endpoint.href;
};
const fetchPrincipalUrl = async (params) => {
	var _a, _b;
	const { account, headers, headersToExclude, fetchOptions = {}, fetch: fetchOverride } = params;
	const requiredFields = ["rootUrl"];
	if (!hasFields(account, requiredFields)) throw new Error(`account must have ${findMissingFieldNames(account, requiredFields)} before fetchPrincipalUrl`);
	debug$1(`Fetching principal url from path ${account.rootUrl}`);
	const [response] = await propfind({
		url: account.rootUrl,
		props: { [`${DAVNamespaceShort.DAV}:current-user-principal`]: {} },
		depth: "0",
		headers: excludeHeaders(headers, headersToExclude),
		fetchOptions,
		fetch: fetchOverride
	});
	if (!response.ok) {
		debug$1(`Fetch principal url failed: ${response.statusText}`);
		if (response.status === 401) throw new Error(`Invalid credentials: PROPFIND ${account.rootUrl} returned 401 Unauthorized`);
		throw new Error("cannot find principalUrl");
	}
	const principalHref = (_b = (_a = response.props) === null || _a === void 0 ? void 0 : _a.currentUserPrincipal) === null || _b === void 0 ? void 0 : _b.href;
	if (typeof principalHref !== "string" || !principalHref.length) {
		debug$1("Fetch principal url failed: missing current-user-principal href");
		throw new Error("cannot find principalUrl");
	}
	debug$1(`Fetched principal url ${principalHref}`);
	return new URL(principalHref, account.rootUrl).href;
};
const fetchHomeUrl = async (params) => {
	var _a, _b, _c, _d;
	const { account, headers, headersToExclude, fetchOptions = {}, fetch: fetchOverride } = params;
	const requiredFields = ["principalUrl", "rootUrl"];
	if (!hasFields(account, requiredFields)) throw new Error(`account must have ${findMissingFieldNames(account, requiredFields)} before fetchHomeUrl`);
	debug$1(`Fetch home url from ${account.principalUrl}`);
	const responses = await propfind({
		url: account.principalUrl,
		props: account.accountType === "caldav" ? { [`${DAVNamespaceShort.CALDAV}:calendar-home-set`]: {} } : { [`${DAVNamespaceShort.CARDDAV}:addressbook-home-set`]: {} },
		depth: "0",
		headers: excludeHeaders(headers, headersToExclude),
		fetchOptions,
		fetch: fetchOverride
	});
	const matched = responses.find((r) => urlContains(account.principalUrl, r.href));
	if (!matched || !matched.ok) {
		debug$1(`Fetch home url failed with status ${matched === null || matched === void 0 ? void 0 : matched.statusText} and error ${JSON.stringify(responses.map((r) => r.error))}`);
		throw new Error("cannot find homeUrl");
	}
	const homeHref = account.accountType === "caldav" ? (_b = (_a = matched.props) === null || _a === void 0 ? void 0 : _a.calendarHomeSet) === null || _b === void 0 ? void 0 : _b.href : (_d = (_c = matched.props) === null || _c === void 0 ? void 0 : _c.addressbookHomeSet) === null || _d === void 0 ? void 0 : _d.href;
	if (typeof homeHref !== "string" || homeHref.length === 0) {
		debug$1(`Fetch home url failed: server did not return a ${account.accountType === "caldav" ? "calendar-home-set" : "addressbook-home-set"} href`);
		throw new Error("cannot find homeUrl");
	}
	const result = new URL(homeHref, account.rootUrl).href;
	debug$1(`Fetched home url ${result}`);
	return result;
};
const createAccount = async (params) => {
	var _a, _b, _c, _d;
	const { account, headers, loadCollections = false, loadObjects = false, headersToExclude, fetchOptions = {}, fetch: fetchOverride } = params;
	const newAccount = { ...account };
	const discoveredRootUrl = (_a = account.rootUrl) !== null && _a !== void 0 ? _a : await serviceDiscovery({
		account,
		headers: excludeHeaders(headers, headersToExclude),
		fetchOptions,
		fetch: fetchOverride
	});
	if (account.rootUrl) newAccount.rootUrl = account.rootUrl;
	else if (account.principalUrl) newAccount.rootUrl = discoveredRootUrl;
	else {
		let lastPrincipalError;
		for (const rootUrl of getCandidateRootUrls(account.serverUrl, discoveredRootUrl)) try {
			const principalUrl = await fetchPrincipalUrl({
				account: {
					...newAccount,
					rootUrl
				},
				headers: excludeHeaders(headers, headersToExclude),
				fetchOptions,
				fetch: fetchOverride
			});
			newAccount.rootUrl = rootUrl;
			newAccount.principalUrl = principalUrl;
			break;
		} catch (err) {
			lastPrincipalError = err;
		}
		if (!newAccount.rootUrl || !newAccount.principalUrl) throw lastPrincipalError !== null && lastPrincipalError !== void 0 ? lastPrincipalError : /* @__PURE__ */ new Error("cannot find principalUrl");
	}
	newAccount.principalUrl = (_c = (_b = account.principalUrl) !== null && _b !== void 0 ? _b : newAccount.principalUrl) !== null && _c !== void 0 ? _c : await fetchPrincipalUrl({
		account: newAccount,
		headers: excludeHeaders(headers, headersToExclude),
		fetchOptions,
		fetch: fetchOverride
	});
	newAccount.homeUrl = (_d = account.homeUrl) !== null && _d !== void 0 ? _d : await fetchHomeUrl({
		account: newAccount,
		headers: excludeHeaders(headers, headersToExclude),
		fetchOptions,
		fetch: fetchOverride
	});
	if (loadCollections || loadObjects) {
		if (account.accountType === "caldav") newAccount.calendars = await fetchCalendars({
			headers: excludeHeaders(headers, headersToExclude),
			account: newAccount,
			fetchOptions,
			fetch: fetchOverride
		});
		else if (account.accountType === "carddav") newAccount.addressBooks = await fetchAddressBooks({
			headers: excludeHeaders(headers, headersToExclude),
			account: newAccount,
			fetchOptions,
			fetch: fetchOverride
		});
	}
	if (loadObjects) {
		if (account.accountType === "caldav" && newAccount.calendars) newAccount.calendars = await Promise.all(newAccount.calendars.map(async (cal) => ({
			...cal,
			objects: await fetchCalendarObjects({
				calendar: cal,
				headers: excludeHeaders(headers, headersToExclude),
				fetchOptions,
				fetch: fetchOverride
			})
		})));
		else if (account.accountType === "carddav" && newAccount.addressBooks) newAccount.addressBooks = await Promise.all(newAccount.addressBooks.map(async (addr) => ({
			...addr,
			objects: await fetchVCards({
				addressBook: addr,
				headers: excludeHeaders(headers, headersToExclude),
				fetchOptions,
				fetch: fetchOverride
			})
		})));
	}
	return newAccount;
};
var account = /* @__PURE__ */ Object.freeze({
	__proto__: null,
	createAccount,
	fetchHomeUrl,
	fetchPrincipalUrl,
	serviceDiscovery
});
const { encode } = import_base64.default;
const debug = (0, import_src.default)("tsdav:authHelper");
/**
* Provide given params as default params to given function with optional params.
*
* suitable only for one param functions
* params are shallow merged
*/
const defaultParam = (fn, params) => (...args) => {
	return fn({
		...params,
		...args[0]
	});
};
const getBasicAuthHeaders = (credentials) => {
	var _a;
	debug(`Basic auth token generated for user "${(_a = credentials.username) !== null && _a !== void 0 ? _a : ""}"`);
	return { authorization: `Basic ${encode(`${credentials.username}:${credentials.password}`)}` };
};
const getBearerAuthHeaders = (credentials) => {
	return { authorization: `Bearer ${credentials.accessToken}` };
};
const fetchOauthTokens = async (credentials, fetchOptions, fetchOverride) => {
	const requireFields = [
		"authorizationCode",
		"redirectUrl",
		"clientId",
		"clientSecret",
		"tokenUrl"
	];
	if (!hasFields(credentials, requireFields)) throw new Error(`Oauth credentials missing: ${findMissingFieldNames(credentials, requireFields)}`);
	const param = new URLSearchParams({
		grant_type: "authorization_code",
		code: credentials.authorizationCode,
		redirect_uri: credentials.redirectUrl,
		client_id: credentials.clientId,
		client_secret: credentials.clientSecret
	});
	debug(`Fetching oauth tokens from ${credentials.tokenUrl}`);
	const response = await (fetchOverride !== null && fetchOverride !== void 0 ? fetchOverride : fetch)(credentials.tokenUrl, {
		method: "POST",
		body: param.toString(),
		headers: {
			"content-length": `${param.toString().length}`,
			"content-type": "application/x-www-form-urlencoded"
		},
		...fetchOptions !== null && fetchOptions !== void 0 ? fetchOptions : {}
	});
	if (response.ok) return await response.json();
	debug(`Fetch Oauth tokens failed with status ${response.status}`);
	return {};
};
const refreshAccessToken = async (credentials, fetchOptions, fetchOverride) => {
	const requireFields = [
		"refreshToken",
		"clientId",
		"clientSecret",
		"tokenUrl"
	];
	if (!hasFields(credentials, requireFields)) throw new Error(`Oauth credentials missing: ${findMissingFieldNames(credentials, requireFields)}`);
	const param = new URLSearchParams({
		client_id: credentials.clientId,
		client_secret: credentials.clientSecret,
		refresh_token: credentials.refreshToken,
		grant_type: "refresh_token"
	});
	const response = await (fetchOverride !== null && fetchOverride !== void 0 ? fetchOverride : fetch)(credentials.tokenUrl, {
		method: "POST",
		body: param.toString(),
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		...fetchOptions !== null && fetchOptions !== void 0 ? fetchOptions : {}
	});
	if (response.ok) return await response.json();
	debug(`Refresh access token failed with status ${response.status}`);
	return {};
};
/**
* Resolve OAuth headers for the given credentials.
*
* This will mutate `credentials` in-place with the freshly issued
* `accessToken`, `refreshToken` (if rotated by the provider), and an
* `expiration` timestamp (ms since epoch). Callers that persist credentials
* across sessions should re-read these fields from the same credentials
* object after this call.
*/
const getOauthHeaders = async (credentials, fetchOptions, fetchOverride) => {
	var _a;
	debug("Fetching oauth headers");
	let tokens = {};
	let didRefresh = false;
	if (!credentials.refreshToken) {
		tokens = await fetchOauthTokens(credentials, fetchOptions, fetchOverride);
		didRefresh = true;
	} else if (credentials.refreshToken && !credentials.accessToken || Date.now() > ((_a = credentials.expiration) !== null && _a !== void 0 ? _a : 0)) {
		tokens = await refreshAccessToken(credentials, fetchOptions, fetchOverride);
		didRefresh = true;
	} else tokens = {
		access_token: credentials.accessToken,
		refresh_token: credentials.refreshToken
	};
	if (didRefresh) {
		if (tokens.access_token) credentials.accessToken = tokens.access_token;
		if (tokens.refresh_token) credentials.refreshToken = tokens.refresh_token;
		if (typeof tokens.expires_in === "number") credentials.expiration = Date.now() + tokens.expires_in * 1e3;
	}
	debug("Oauth tokens obtained");
	return {
		tokens,
		headers: tokens.access_token ? { authorization: `Bearer ${tokens.access_token}` } : {}
	};
};
var authHelpers = /* @__PURE__ */ Object.freeze({
	__proto__: null,
	defaultParam,
	fetchOauthTokens,
	getBasicAuthHeaders,
	getBearerAuthHeaders,
	getOauthHeaders,
	refreshAccessToken
});
const createDAVClient = async (params) => {
	var _a;
	const { serverUrl, credentials, authMethod = "Basic", defaultAccountType, authFunction, fetchOptions: defaultFetchOptions, fetch: fetchOverride } = params;
	let authHeaders = {};
	switch (authMethod) {
		case "Basic":
			authHeaders = getBasicAuthHeaders(credentials);
			break;
		case "Bearer":
			authHeaders = getBearerAuthHeaders(credentials);
			break;
		case "Oauth":
			authHeaders = (await getOauthHeaders(credentials, void 0, fetchOverride)).headers;
			break;
		case "Digest":
			authHeaders = { Authorization: `Digest ${credentials.digestString}` };
			break;
		case "Custom":
			if (!authFunction) throw new Error("authMethod 'Custom' requires an authFunction to produce request headers");
			authHeaders = (_a = await authFunction(credentials)) !== null && _a !== void 0 ? _a : {};
			break;
		default: throw new Error("Invalid auth method");
	}
	const defaultAccount = defaultAccountType ? await createAccount({
		account: {
			serverUrl,
			credentials,
			accountType: defaultAccountType
		},
		headers: authHeaders,
		fetchOptions: defaultFetchOptions,
		fetch: fetchOverride
	}) : void 0;
	const davRequest$1 = async (params0) => {
		const { init, fetchOptions, fetch: fetchOverride2, ...rest } = params0;
		const { headers, ...restInit } = init;
		return davRequest({
			...rest,
			init: {
				...restInit,
				headers: {
					...authHeaders,
					...headers
				}
			},
			fetchOptions: fetchOptions !== null && fetchOptions !== void 0 ? fetchOptions : defaultFetchOptions,
			fetch: fetchOverride2 !== null && fetchOverride2 !== void 0 ? fetchOverride2 : fetchOverride
		});
	};
	const commonDefaults = {
		headers: authHeaders,
		fetchOptions: defaultFetchOptions,
		fetch: fetchOverride
	};
	const commonDefaultsWithUrl = {
		url: serverUrl,
		...commonDefaults
	};
	const commonDefaultsWithAccount = {
		account: defaultAccount,
		...commonDefaults
	};
	const createObject$1 = defaultParam(createObject, commonDefaultsWithUrl);
	const updateObject$1 = defaultParam(updateObject, commonDefaultsWithUrl);
	const deleteObject$1 = defaultParam(deleteObject, commonDefaultsWithUrl);
	const propfind$1 = defaultParam(propfind, commonDefaults);
	const createAccount$1 = async (params0) => {
		const { account, headers, loadCollections, loadObjects, fetchOptions, fetch: fetchOverride2 } = params0;
		const merged = {
			serverUrl,
			credentials,
			...account
		};
		if (!merged.accountType) throw new Error("createAccount requires an accountType; pass one via `account.accountType` or set `defaultAccountType` on the client.");
		return createAccount({
			account: merged,
			headers: {
				...authHeaders,
				...headers
			},
			loadCollections,
			loadObjects,
			fetchOptions: fetchOptions !== null && fetchOptions !== void 0 ? fetchOptions : defaultFetchOptions,
			fetch: fetchOverride2 !== null && fetchOverride2 !== void 0 ? fetchOverride2 : fetchOverride
		});
	};
	const collectionQuery$1 = defaultParam(collectionQuery, commonDefaults);
	const makeCollection$1 = defaultParam(makeCollection, commonDefaults);
	const syncCollection$1 = defaultParam(syncCollection, commonDefaults);
	const supportedReportSet$1 = defaultParam(supportedReportSet, commonDefaults);
	const isCollectionDirty$1 = defaultParam(isCollectionDirty, commonDefaults);
	const smartCollectionSync$1 = defaultParam(smartCollectionSync, commonDefaultsWithAccount);
	const smartCollectionSyncDetailed$1 = defaultParam(smartCollectionSyncDetailed, commonDefaultsWithAccount);
	const calendarQuery$1 = defaultParam(calendarQuery, commonDefaults);
	const calendarMultiGet$1 = defaultParam(calendarMultiGet, commonDefaults);
	const makeCalendar$1 = defaultParam(makeCalendar, commonDefaults);
	const fetchCalendars$1 = defaultParam(fetchCalendars, commonDefaultsWithAccount);
	const fetchCalendarUserAddresses$1 = defaultParam(fetchCalendarUserAddresses, commonDefaultsWithAccount);
	const fetchCalendarObjects$1 = defaultParam(fetchCalendarObjects, commonDefaults);
	const createCalendarObject$1 = defaultParam(createCalendarObject, commonDefaults);
	const updateCalendarObject$1 = defaultParam(updateCalendarObject, commonDefaults);
	const deleteCalendarObject$1 = defaultParam(deleteCalendarObject, commonDefaults);
	const syncCalendars$1 = defaultParam(syncCalendars, commonDefaultsWithAccount);
	const syncCalendarsDetailed$1 = defaultParam(syncCalendarsDetailed, commonDefaultsWithAccount);
	const addressBookQuery$1 = defaultParam(addressBookQuery, commonDefaults);
	const addressBookMultiGet$1 = defaultParam(addressBookMultiGet, commonDefaults);
	return {
		davRequest: davRequest$1,
		propfind: propfind$1,
		createAccount: createAccount$1,
		createObject: createObject$1,
		updateObject: updateObject$1,
		deleteObject: deleteObject$1,
		calendarQuery: calendarQuery$1,
		addressBookQuery: addressBookQuery$1,
		collectionQuery: collectionQuery$1,
		makeCollection: makeCollection$1,
		calendarMultiGet: calendarMultiGet$1,
		makeCalendar: makeCalendar$1,
		syncCollection: syncCollection$1,
		supportedReportSet: supportedReportSet$1,
		isCollectionDirty: isCollectionDirty$1,
		smartCollectionSync: smartCollectionSync$1,
		smartCollectionSyncDetailed: smartCollectionSyncDetailed$1,
		fetchCalendars: fetchCalendars$1,
		fetchCalendarUserAddresses: fetchCalendarUserAddresses$1,
		fetchCalendarObjects: fetchCalendarObjects$1,
		createCalendarObject: createCalendarObject$1,
		updateCalendarObject: updateCalendarObject$1,
		deleteCalendarObject: deleteCalendarObject$1,
		syncCalendars: syncCalendars$1,
		syncCalendarsDetailed: syncCalendarsDetailed$1,
		fetchAddressBooks: defaultParam(fetchAddressBooks, commonDefaultsWithAccount),
		addressBookMultiGet: addressBookMultiGet$1,
		fetchVCards: defaultParam(fetchVCards, commonDefaults),
		createVCard: defaultParam(createVCard, commonDefaults),
		updateVCard: defaultParam(updateVCard, commonDefaults),
		deleteVCard: defaultParam(deleteVCard, commonDefaults)
	};
};
var DAVClient = class {
	constructor(params) {
		var _a, _b, _c;
		this.serverUrl = params.serverUrl;
		this.credentials = params.credentials;
		this.authMethod = (_a = params.authMethod) !== null && _a !== void 0 ? _a : "Basic";
		this.accountType = (_b = params.defaultAccountType) !== null && _b !== void 0 ? _b : "caldav";
		this.authFunction = params.authFunction;
		this.fetchOptions = (_c = params.fetchOptions) !== null && _c !== void 0 ? _c : {};
		this.fetchOverride = params.fetch;
	}
	async login(options) {
		switch (this.authMethod) {
			case "Basic":
				this.authHeaders = getBasicAuthHeaders(this.credentials);
				break;
			case "Bearer":
				this.authHeaders = getBearerAuthHeaders(this.credentials);
				break;
			case "Oauth":
				this.authHeaders = (await getOauthHeaders(this.credentials, this.fetchOptions, this.fetchOverride)).headers;
				break;
			case "Digest":
				this.authHeaders = { Authorization: `Digest ${this.credentials.digestString}` };
				break;
			case "Custom":
				if (!this.authFunction) throw new Error("authMethod 'Custom' requires an authFunction to produce request headers");
				this.authHeaders = await this.authFunction(this.credentials);
				break;
			default: throw new Error("Invalid auth method");
		}
		this.account = this.accountType ? await createAccount({
			account: {
				serverUrl: this.serverUrl,
				credentials: this.credentials,
				accountType: this.accountType
			},
			headers: this.authHeaders,
			loadCollections: options === null || options === void 0 ? void 0 : options.loadCollections,
			loadObjects: options === null || options === void 0 ? void 0 : options.loadObjects,
			fetchOptions: this.fetchOptions,
			fetch: this.fetchOverride
		}) : void 0;
	}
	async davRequest(params0) {
		const { init, fetchOptions, fetch: fetchOverride2, ...rest } = params0;
		const { headers, ...restInit } = init;
		return davRequest({
			...rest,
			init: {
				...restInit,
				headers: {
					...this.authHeaders,
					...headers
				}
			},
			fetchOptions: fetchOptions !== null && fetchOptions !== void 0 ? fetchOptions : this.fetchOptions,
			fetch: fetchOverride2 !== null && fetchOverride2 !== void 0 ? fetchOverride2 : this.fetchOverride
		});
	}
	async createObject(...params) {
		return defaultParam(createObject, {
			url: this.serverUrl,
			headers: this.authHeaders,
			fetchOptions: this.fetchOptions,
			fetch: this.fetchOverride
		})(params[0]);
	}
	async updateObject(...params) {
		return defaultParam(updateObject, {
			url: this.serverUrl,
			headers: this.authHeaders,
			fetchOptions: this.fetchOptions,
			fetch: this.fetchOverride
		})(params[0]);
	}
	async deleteObject(...params) {
		return defaultParam(deleteObject, {
			url: this.serverUrl,
			headers: this.authHeaders,
			fetchOptions: this.fetchOptions,
			fetch: this.fetchOverride
		})(params[0]);
	}
	async propfind(...params) {
		return defaultParam(propfind, {
			headers: this.authHeaders,
			fetchOptions: this.fetchOptions,
			fetch: this.fetchOverride
		})(params[0]);
	}
	async createAccount(params0) {
		var _a;
		const { account, headers, loadCollections, loadObjects, fetchOptions, fetch } = params0;
		const accountType = (_a = account.accountType) !== null && _a !== void 0 ? _a : this.accountType;
		if (!accountType) throw new Error("createAccount requires an accountType; pass one via `account.accountType` or configure `defaultAccountType` on the DAVClient.");
		return createAccount({
			account: {
				serverUrl: this.serverUrl,
				credentials: this.credentials,
				...account,
				accountType
			},
			headers: {
				...this.authHeaders,
				...headers
			},
			loadCollections,
			loadObjects,
			fetchOptions: fetchOptions !== null && fetchOptions !== void 0 ? fetchOptions : this.fetchOptions,
			fetch: fetch !== null && fetch !== void 0 ? fetch : this.fetchOverride
		});
	}
	async collectionQuery(...params) {
		return defaultParam(collectionQuery, {
			headers: this.authHeaders,
			fetchOptions: this.fetchOptions,
			fetch: this.fetchOverride
		})(params[0]);
	}
	async makeCollection(...params) {
		return defaultParam(makeCollection, {
			headers: this.authHeaders,
			fetchOptions: this.fetchOptions,
			fetch: this.fetchOverride
		})(params[0]);
	}
	async syncCollection(...params) {
		return defaultParam(syncCollection, {
			headers: this.authHeaders,
			fetchOptions: this.fetchOptions,
			fetch: this.fetchOverride
		})(params[0]);
	}
	async supportedReportSet(...params) {
		return defaultParam(supportedReportSet, {
			headers: this.authHeaders,
			fetchOptions: this.fetchOptions,
			fetch: this.fetchOverride
		})(params[0]);
	}
	async isCollectionDirty(...params) {
		return defaultParam(isCollectionDirty, {
			headers: this.authHeaders,
			fetchOptions: this.fetchOptions,
			fetch: this.fetchOverride
		})(params[0]);
	}
	async smartCollectionSync(...params) {
		return defaultParam(smartCollectionSync, {
			headers: this.authHeaders,
			fetchOptions: this.fetchOptions,
			fetch: this.fetchOverride,
			account: this.account
		})(params[0]);
	}
	async smartCollectionSyncDetailed(param) {
		return defaultParam(smartCollectionSyncDetailed, {
			headers: this.authHeaders,
			fetchOptions: this.fetchOptions,
			fetch: this.fetchOverride,
			account: this.account
		})(param);
	}
	async calendarQuery(...params) {
		return defaultParam(calendarQuery, {
			headers: this.authHeaders,
			fetchOptions: this.fetchOptions,
			fetch: this.fetchOverride
		})(params[0]);
	}
	async makeCalendar(...params) {
		return defaultParam(makeCalendar, {
			headers: this.authHeaders,
			fetchOptions: this.fetchOptions,
			fetch: this.fetchOverride
		})(params[0]);
	}
	async calendarMultiGet(...params) {
		return defaultParam(calendarMultiGet, {
			headers: this.authHeaders,
			fetchOptions: this.fetchOptions,
			fetch: this.fetchOverride
		})(params[0]);
	}
	async fetchCalendars(...params) {
		return defaultParam(fetchCalendars, {
			headers: this.authHeaders,
			account: this.account,
			fetchOptions: this.fetchOptions,
			fetch: this.fetchOverride
		})(params === null || params === void 0 ? void 0 : params[0]);
	}
	async fetchCalendarUserAddresses(...params) {
		return defaultParam(fetchCalendarUserAddresses, {
			headers: this.authHeaders,
			account: this.account,
			fetchOptions: this.fetchOptions,
			fetch: this.fetchOverride
		})(params === null || params === void 0 ? void 0 : params[0]);
	}
	async fetchCalendarObjects(...params) {
		return defaultParam(fetchCalendarObjects, {
			headers: this.authHeaders,
			fetchOptions: this.fetchOptions,
			fetch: this.fetchOverride
		})(params[0]);
	}
	async createCalendarObject(...params) {
		return defaultParam(createCalendarObject, {
			headers: this.authHeaders,
			fetchOptions: this.fetchOptions,
			fetch: this.fetchOverride
		})(params[0]);
	}
	async updateCalendarObject(...params) {
		return defaultParam(updateCalendarObject, {
			headers: this.authHeaders,
			fetchOptions: this.fetchOptions,
			fetch: this.fetchOverride
		})(params[0]);
	}
	async deleteCalendarObject(...params) {
		return defaultParam(deleteCalendarObject, {
			headers: this.authHeaders,
			fetchOptions: this.fetchOptions,
			fetch: this.fetchOverride
		})(params[0]);
	}
	async syncCalendars(...params) {
		return defaultParam(syncCalendars, {
			headers: this.authHeaders,
			account: this.account,
			fetchOptions: this.fetchOptions,
			fetch: this.fetchOverride
		})(params[0]);
	}
	async syncCalendarsDetailed(...params) {
		return defaultParam(syncCalendarsDetailed, {
			headers: this.authHeaders,
			account: this.account,
			fetchOptions: this.fetchOptions,
			fetch: this.fetchOverride
		})(params[0]);
	}
	async addressBookQuery(...params) {
		return defaultParam(addressBookQuery, {
			headers: this.authHeaders,
			fetchOptions: this.fetchOptions,
			fetch: this.fetchOverride
		})(params[0]);
	}
	async addressBookMultiGet(...params) {
		return defaultParam(addressBookMultiGet, {
			headers: this.authHeaders,
			fetchOptions: this.fetchOptions,
			fetch: this.fetchOverride
		})(params[0]);
	}
	async fetchAddressBooks(...params) {
		return defaultParam(fetchAddressBooks, {
			headers: this.authHeaders,
			account: this.account,
			fetchOptions: this.fetchOptions,
			fetch: this.fetchOverride
		})(params === null || params === void 0 ? void 0 : params[0]);
	}
	async fetchVCards(...params) {
		return defaultParam(fetchVCards, {
			headers: this.authHeaders,
			fetchOptions: this.fetchOptions,
			fetch: this.fetchOverride
		})(params[0]);
	}
	async createVCard(...params) {
		return defaultParam(createVCard, {
			headers: this.authHeaders,
			fetchOptions: this.fetchOptions,
			fetch: this.fetchOverride
		})(params[0]);
	}
	async updateVCard(...params) {
		return defaultParam(updateVCard, {
			headers: this.authHeaders,
			fetchOptions: this.fetchOptions,
			fetch: this.fetchOverride
		})(params[0]);
	}
	async deleteVCard(...params) {
		return defaultParam(deleteVCard, {
			headers: this.authHeaders,
			fetchOptions: this.fetchOptions,
			fetch: this.fetchOverride
		})(params[0]);
	}
};
var index = {
	DAVNamespace,
	DAVNamespaceShort,
	DAVAttributeMap,
	.../* @__PURE__ */ Object.freeze({
		__proto__: null,
		DAVClient,
		createDAVClient
	}),
	...request,
	...collection,
	...account,
	...addressBook,
	...calendar,
	...authHelpers,
	...requestHelpers
};
//#endregion
export { index as t };
