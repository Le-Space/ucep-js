import { decodeMessage, encodeMessage, enumeration, MaxLengthError, message, streamMessage } from "protons-runtime";
import { alloc as uint8ArrayAlloc } from "uint8arrays/alloc";
var ext;
((ext2) => {
  let ExtensionManifest;
  ((ExtensionManifest2) => {
    let _codec2;
    ExtensionManifest2.codec = () => {
      if (_codec2 == null) {
        _codec2 = message((obj, w, opts = {}) => {
          if (opts.lengthDelimited !== false) {
            w.fork();
          }
          if (obj.id != null && obj.id !== "") {
            w.uint32(10);
            w.string(obj.id);
          }
          if (obj.name != null && obj.name !== "") {
            w.uint32(18);
            w.string(obj.name);
          }
          if (obj.version != null && obj.version !== "") {
            w.uint32(26);
            w.string(obj.version);
          }
          if (obj.description != null && obj.description !== "") {
            w.uint32(34);
            w.string(obj.description);
          }
          if (obj.author != null && obj.author !== "") {
            w.uint32(42);
            w.string(obj.author);
          }
          if (obj.publicUrl != null && obj.publicUrl !== "") {
            w.uint32(50);
            w.string(obj.publicUrl);
          }
          if (obj.commands != null && obj.commands.length > 0) {
            for (const value of obj.commands) {
              w.uint32(58);
              ext2.ExtensionCommand.codec().encode(value, w);
            }
          }
          if (obj.icon != null && obj.icon !== "") {
            w.uint32(66);
            w.string(obj.icon);
          }
          if (obj.ucepVersion != null && obj.ucepVersion !== 0) {
            w.uint32(72);
            w.uint32(obj.ucepVersion);
          }
          if (obj.pairingModes != null && obj.pairingModes.length > 0) {
            for (const value of obj.pairingModes) {
              w.uint32(80);
              ext2.PairingMode.codec().encode(value, w);
            }
          }
          if (obj.scopes != null && obj.scopes.length > 0) {
            for (const value of obj.scopes) {
              w.uint32(90);
              ext2.ScopeInfo.codec().encode(value, w);
            }
          }
          if (opts.lengthDelimited !== false) {
            w.ldelim();
          }
        }, (r, length, opts = {}) => {
          const obj = {
            id: "",
            name: "",
            version: "",
            description: "",
            author: "",
            publicUrl: "",
            commands: [],
            icon: "",
            ucepVersion: 0,
            pairingModes: [],
            scopes: []
          };
          const end = length == null ? r.len : r.pos + length;
          while (r.pos < end) {
            const tag = r.uint32();
            switch (tag >>> 3) {
              case 1: {
                obj.id = r.string();
                break;
              }
              case 2: {
                obj.name = r.string();
                break;
              }
              case 3: {
                obj.version = r.string();
                break;
              }
              case 4: {
                obj.description = r.string();
                break;
              }
              case 5: {
                obj.author = r.string();
                break;
              }
              case 6: {
                obj.publicUrl = r.string();
                break;
              }
              case 7: {
                if (opts.limits?.commands != null && obj.commands.length === opts.limits.commands) {
                  throw new MaxLengthError('Decode error - repeated field "commands" had too many elements');
                }
                obj.commands.push(ext2.ExtensionCommand.codec().decode(r, r.uint32(), {
                  limits: opts.limits?.commands$
                }));
                break;
              }
              case 8: {
                obj.icon = r.string();
                break;
              }
              case 9: {
                obj.ucepVersion = r.uint32();
                break;
              }
              case 10: {
                if (opts.limits?.pairingModes != null && obj.pairingModes.length === opts.limits.pairingModes) {
                  throw new MaxLengthError('Decode error - repeated field "pairingModes" had too many elements');
                }
                obj.pairingModes.push(ext2.PairingMode.codec().decode(r));
                break;
              }
              case 11: {
                if (opts.limits?.scopes != null && obj.scopes.length === opts.limits.scopes) {
                  throw new MaxLengthError('Decode error - repeated field "scopes" had too many elements');
                }
                obj.scopes.push(ext2.ScopeInfo.codec().decode(r, r.uint32(), {
                  limits: opts.limits?.scopes$
                }));
                break;
              }
              default: {
                r.skipType(tag & 7);
                break;
              }
            }
          }
          return obj;
        }, function* (r, length, prefix, opts = {}) {
          const obj = {
            commands: 0,
            pairingModes: 0,
            scopes: 0
          };
          const end = length == null ? r.len : r.pos + length;
          if (prefix !== ".") {
            yield {
              field: prefix.endsWith(".") ? prefix.substring(0, prefix.length - 1) : prefix,
              type: "start",
              message: "ext.ExtensionManifest"
            };
          }
          while (r.pos < end) {
            const tag = r.uint32();
            switch (tag >>> 3) {
              case 1: {
                yield {
                  field: `${prefix}id`,
                  value: r.string()
                };
                break;
              }
              case 2: {
                yield {
                  field: `${prefix}name`,
                  value: r.string()
                };
                break;
              }
              case 3: {
                yield {
                  field: `${prefix}version`,
                  value: r.string()
                };
                break;
              }
              case 4: {
                yield {
                  field: `${prefix}description`,
                  value: r.string()
                };
                break;
              }
              case 5: {
                yield {
                  field: `${prefix}author`,
                  value: r.string()
                };
                break;
              }
              case 6: {
                yield {
                  field: `${prefix}publicUrl`,
                  value: r.string()
                };
                break;
              }
              case 7: {
                if (opts.limits?.commands != null && obj.commands === opts.limits.commands) {
                  throw new MaxLengthError('Streaming decode error - repeated field "commands" had too many elements');
                }
                for (const evt of ext2.ExtensionCommand.codec().stream(r, r.uint32(), `${prefix}commands[].`, {
                  limits: opts.limits?.commands$
                })) {
                  yield {
                    ...evt,
                    index: obj.commands
                  };
                }
                obj.commands++;
                break;
              }
              case 8: {
                yield {
                  field: `${prefix}icon`,
                  value: r.string()
                };
                break;
              }
              case 9: {
                yield {
                  field: `${prefix}ucepVersion`,
                  value: r.uint32()
                };
                break;
              }
              case 10: {
                if (opts.limits?.pairingModes != null && obj.pairingModes === opts.limits.pairingModes) {
                  throw new MaxLengthError('Streaming decode error - repeated field "pairingModes" had too many elements');
                }
                yield {
                  field: `${prefix}pairingModes[]`,
                  index: obj.pairingModes,
                  value: ext2.PairingMode.codec().decode(r)
                };
                obj.pairingModes++;
                break;
              }
              case 11: {
                if (opts.limits?.scopes != null && obj.scopes === opts.limits.scopes) {
                  throw new MaxLengthError('Streaming decode error - repeated field "scopes" had too many elements');
                }
                for (const evt of ext2.ScopeInfo.codec().stream(r, r.uint32(), `${prefix}scopes[].`, {
                  limits: opts.limits?.scopes$
                })) {
                  yield {
                    ...evt,
                    index: obj.scopes
                  };
                }
                obj.scopes++;
                break;
              }
              default: {
                r.skipType(tag & 7);
                break;
              }
            }
          }
          if (prefix !== ".") {
            yield {
              field: prefix.endsWith(".") ? prefix.substring(0, prefix.length - 1) : prefix,
              type: "end",
              message: "ext.ExtensionManifest"
            };
          }
        });
      }
      return _codec2;
    };
    function encode2(obj) {
      return encodeMessage(obj, ExtensionManifest2.codec());
    }
    ExtensionManifest2.encode = encode2;
    function decode2(buf, opts) {
      return decodeMessage(buf, ExtensionManifest2.codec(), opts);
    }
    ExtensionManifest2.decode = decode2;
    function stream2(buf, opts) {
      return streamMessage(buf, ExtensionManifest2.codec(), opts);
    }
    ExtensionManifest2.stream = stream2;
  })(ExtensionManifest = ext2.ExtensionManifest || (ext2.ExtensionManifest = {}));
  let PairingMode;
  ((PairingMode2) => {
    PairingMode2["PAIRING_MODE_UNSPECIFIED"] = "PAIRING_MODE_UNSPECIFIED";
    PairingMode2["INVITATION"] = "INVITATION";
    PairingMode2["IN_BAND"] = "IN_BAND";
  })(PairingMode = ext2.PairingMode || (ext2.PairingMode = {}));
  let __PairingModeValues;
  ((__PairingModeValues2) => {
    __PairingModeValues2[__PairingModeValues2["PAIRING_MODE_UNSPECIFIED"] = 0] = "PAIRING_MODE_UNSPECIFIED";
    __PairingModeValues2[__PairingModeValues2["INVITATION"] = 1] = "INVITATION";
    __PairingModeValues2[__PairingModeValues2["IN_BAND"] = 2] = "IN_BAND";
  })(__PairingModeValues || (__PairingModeValues = {}));
  ((PairingMode2) => {
    PairingMode2.codec = () => {
      return enumeration(__PairingModeValues);
    };
  })(PairingMode = ext2.PairingMode || (ext2.PairingMode = {}));
  let ExtensionCommand;
  ((ExtensionCommand2) => {
    let _codec2;
    ExtensionCommand2.codec = () => {
      if (_codec2 == null) {
        _codec2 = message((obj, w, opts = {}) => {
          if (opts.lengthDelimited !== false) {
            w.fork();
          }
          if (obj.name != null && obj.name !== "") {
            w.uint32(10);
            w.string(obj.name);
          }
          if (obj.syntax != null && obj.syntax !== "") {
            w.uint32(18);
            w.string(obj.syntax);
          }
          if (obj.description != null && obj.description !== "") {
            w.uint32(26);
            w.string(obj.description);
          }
          if (obj.scope != null && obj.scope !== "") {
            w.uint32(34);
            w.string(obj.scope);
          }
          if (obj.argsSchema != null && obj.argsSchema !== "") {
            w.uint32(42);
            w.string(obj.argsSchema);
          }
          if (obj.resultSchema != null && obj.resultSchema !== "") {
            w.uint32(50);
            w.string(obj.resultSchema);
          }
          if (obj.idempotent != null && obj.idempotent !== false) {
            w.uint32(56);
            w.bool(obj.idempotent);
          }
          if (opts.lengthDelimited !== false) {
            w.ldelim();
          }
        }, (r, length) => {
          const obj = {
            name: "",
            syntax: "",
            description: "",
            scope: "",
            argsSchema: "",
            resultSchema: "",
            idempotent: false
          };
          const end = length == null ? r.len : r.pos + length;
          while (r.pos < end) {
            const tag = r.uint32();
            switch (tag >>> 3) {
              case 1: {
                obj.name = r.string();
                break;
              }
              case 2: {
                obj.syntax = r.string();
                break;
              }
              case 3: {
                obj.description = r.string();
                break;
              }
              case 4: {
                obj.scope = r.string();
                break;
              }
              case 5: {
                obj.argsSchema = r.string();
                break;
              }
              case 6: {
                obj.resultSchema = r.string();
                break;
              }
              case 7: {
                obj.idempotent = r.bool();
                break;
              }
              default: {
                r.skipType(tag & 7);
                break;
              }
            }
          }
          return obj;
        }, function* (r, length, prefix) {
          const end = length == null ? r.len : r.pos + length;
          if (prefix !== ".") {
            yield {
              field: prefix.endsWith(".") ? prefix.substring(0, prefix.length - 1) : prefix,
              type: "start",
              message: "ext.ExtensionCommand"
            };
          }
          while (r.pos < end) {
            const tag = r.uint32();
            switch (tag >>> 3) {
              case 1: {
                yield {
                  field: `${prefix}name`,
                  value: r.string()
                };
                break;
              }
              case 2: {
                yield {
                  field: `${prefix}syntax`,
                  value: r.string()
                };
                break;
              }
              case 3: {
                yield {
                  field: `${prefix}description`,
                  value: r.string()
                };
                break;
              }
              case 4: {
                yield {
                  field: `${prefix}scope`,
                  value: r.string()
                };
                break;
              }
              case 5: {
                yield {
                  field: `${prefix}argsSchema`,
                  value: r.string()
                };
                break;
              }
              case 6: {
                yield {
                  field: `${prefix}resultSchema`,
                  value: r.string()
                };
                break;
              }
              case 7: {
                yield {
                  field: `${prefix}idempotent`,
                  value: r.bool()
                };
                break;
              }
              default: {
                r.skipType(tag & 7);
                break;
              }
            }
          }
          if (prefix !== ".") {
            yield {
              field: prefix.endsWith(".") ? prefix.substring(0, prefix.length - 1) : prefix,
              type: "end",
              message: "ext.ExtensionCommand"
            };
          }
        });
      }
      return _codec2;
    };
    function encode2(obj) {
      return encodeMessage(obj, ExtensionCommand2.codec());
    }
    ExtensionCommand2.encode = encode2;
    function decode2(buf, opts) {
      return decodeMessage(buf, ExtensionCommand2.codec(), opts);
    }
    ExtensionCommand2.decode = decode2;
    function stream2(buf, opts) {
      return streamMessage(buf, ExtensionCommand2.codec(), opts);
    }
    ExtensionCommand2.stream = stream2;
  })(ExtensionCommand = ext2.ExtensionCommand || (ext2.ExtensionCommand = {}));
  let ScopeInfo;
  ((ScopeInfo2) => {
    let _codec2;
    ScopeInfo2.codec = () => {
      if (_codec2 == null) {
        _codec2 = message((obj, w, opts = {}) => {
          if (opts.lengthDelimited !== false) {
            w.fork();
          }
          if (obj.name != null && obj.name !== "") {
            w.uint32(10);
            w.string(obj.name);
          }
          if (obj.description != null && obj.description !== "") {
            w.uint32(18);
            w.string(obj.description);
          }
          if (opts.lengthDelimited !== false) {
            w.ldelim();
          }
        }, (r, length) => {
          const obj = {
            name: "",
            description: ""
          };
          const end = length == null ? r.len : r.pos + length;
          while (r.pos < end) {
            const tag = r.uint32();
            switch (tag >>> 3) {
              case 1: {
                obj.name = r.string();
                break;
              }
              case 2: {
                obj.description = r.string();
                break;
              }
              default: {
                r.skipType(tag & 7);
                break;
              }
            }
          }
          return obj;
        }, function* (r, length, prefix) {
          const end = length == null ? r.len : r.pos + length;
          if (prefix !== ".") {
            yield {
              field: prefix.endsWith(".") ? prefix.substring(0, prefix.length - 1) : prefix,
              type: "start",
              message: "ext.ScopeInfo"
            };
          }
          while (r.pos < end) {
            const tag = r.uint32();
            switch (tag >>> 3) {
              case 1: {
                yield {
                  field: `${prefix}name`,
                  value: r.string()
                };
                break;
              }
              case 2: {
                yield {
                  field: `${prefix}description`,
                  value: r.string()
                };
                break;
              }
              default: {
                r.skipType(tag & 7);
                break;
              }
            }
          }
          if (prefix !== ".") {
            yield {
              field: prefix.endsWith(".") ? prefix.substring(0, prefix.length - 1) : prefix,
              type: "end",
              message: "ext.ScopeInfo"
            };
          }
        });
      }
      return _codec2;
    };
    function encode2(obj) {
      return encodeMessage(obj, ScopeInfo2.codec());
    }
    ScopeInfo2.encode = encode2;
    function decode2(buf, opts) {
      return decodeMessage(buf, ScopeInfo2.codec(), opts);
    }
    ScopeInfo2.decode = decode2;
    function stream2(buf, opts) {
      return streamMessage(buf, ScopeInfo2.codec(), opts);
    }
    ScopeInfo2.stream = stream2;
  })(ScopeInfo = ext2.ScopeInfo || (ext2.ScopeInfo = {}));
  let Request;
  ((Request2) => {
    let _codec2;
    Request2.codec = () => {
      if (_codec2 == null) {
        _codec2 = message((obj, w, opts = {}) => {
          if (opts.lengthDelimited !== false) {
            w.fork();
          }
          obj = { ...obj };
          if (obj.unpair != null) {
            obj.pair = void 0;
            obj.command = void 0;
            obj.manifest = void 0;
          }
          if (obj.pair != null) {
            obj.unpair = void 0;
            obj.command = void 0;
            obj.manifest = void 0;
          }
          if (obj.command != null) {
            obj.unpair = void 0;
            obj.pair = void 0;
            obj.manifest = void 0;
          }
          if (obj.manifest != null) {
            obj.unpair = void 0;
            obj.pair = void 0;
            obj.command = void 0;
          }
          if (obj.manifest != null) {
            w.uint32(10);
            ext2.ManifestRequest.codec().encode(obj.manifest, w);
          }
          if (obj.command != null) {
            w.uint32(18);
            ext2.CommandRequest.codec().encode(obj.command, w);
          }
          if (obj.pair != null) {
            w.uint32(26);
            ext2.PairRequest.codec().encode(obj.pair, w);
          }
          if (obj.unpair != null) {
            w.uint32(34);
            ext2.UnpairRequest.codec().encode(obj.unpair, w);
          }
          if (opts.lengthDelimited !== false) {
            w.ldelim();
          }
        }, (r, length, opts = {}) => {
          const obj = {};
          const end = length == null ? r.len : r.pos + length;
          while (r.pos < end) {
            const tag = r.uint32();
            switch (tag >>> 3) {
              case 1: {
                obj.manifest = ext2.ManifestRequest.codec().decode(r, r.uint32(), {
                  limits: opts.limits?.manifest
                });
                break;
              }
              case 2: {
                obj.command = ext2.CommandRequest.codec().decode(r, r.uint32(), {
                  limits: opts.limits?.command
                });
                break;
              }
              case 3: {
                obj.pair = ext2.PairRequest.codec().decode(r, r.uint32(), {
                  limits: opts.limits?.pair
                });
                break;
              }
              case 4: {
                obj.unpair = ext2.UnpairRequest.codec().decode(r, r.uint32(), {
                  limits: opts.limits?.unpair
                });
                break;
              }
              default: {
                r.skipType(tag & 7);
                break;
              }
            }
          }
          if (obj.unpair != null) {
            delete obj.pair;
            delete obj.command;
            delete obj.manifest;
          }
          if (obj.pair != null) {
            delete obj.unpair;
            delete obj.command;
            delete obj.manifest;
          }
          if (obj.command != null) {
            delete obj.unpair;
            delete obj.pair;
            delete obj.manifest;
          }
          if (obj.manifest != null) {
            delete obj.unpair;
            delete obj.pair;
            delete obj.command;
          }
          return obj;
        }, function* (r, length, prefix, opts = {}) {
          const end = length == null ? r.len : r.pos + length;
          if (prefix !== ".") {
            yield {
              field: prefix.endsWith(".") ? prefix.substring(0, prefix.length - 1) : prefix,
              type: "start",
              message: "ext.Request"
            };
          }
          while (r.pos < end) {
            const tag = r.uint32();
            switch (tag >>> 3) {
              case 1: {
                yield* ext2.ManifestRequest.codec().stream(r, r.uint32(), `${prefix}manifest.`, {
                  limits: opts.limits?.manifest
                });
                break;
              }
              case 2: {
                yield* ext2.CommandRequest.codec().stream(r, r.uint32(), `${prefix}command.`, {
                  limits: opts.limits?.command
                });
                break;
              }
              case 3: {
                yield* ext2.PairRequest.codec().stream(r, r.uint32(), `${prefix}pair.`, {
                  limits: opts.limits?.pair
                });
                break;
              }
              case 4: {
                yield* ext2.UnpairRequest.codec().stream(r, r.uint32(), `${prefix}unpair.`, {
                  limits: opts.limits?.unpair
                });
                break;
              }
              default: {
                r.skipType(tag & 7);
                break;
              }
            }
          }
          if (prefix !== ".") {
            yield {
              field: prefix.endsWith(".") ? prefix.substring(0, prefix.length - 1) : prefix,
              type: "end",
              message: "ext.Request"
            };
          }
        });
      }
      return _codec2;
    };
    function encode2(obj) {
      return encodeMessage(obj, Request2.codec());
    }
    Request2.encode = encode2;
    function decode2(buf, opts) {
      return decodeMessage(buf, Request2.codec(), opts);
    }
    Request2.decode = decode2;
    function stream2(buf, opts) {
      return streamMessage(buf, Request2.codec(), opts);
    }
    Request2.stream = stream2;
  })(Request = ext2.Request || (ext2.Request = {}));
  let Response;
  ((Response2) => {
    let _codec2;
    Response2.codec = () => {
      if (_codec2 == null) {
        _codec2 = message((obj, w, opts = {}) => {
          if (opts.lengthDelimited !== false) {
            w.fork();
          }
          obj = { ...obj };
          if (obj.unpair != null) {
            obj.pair = void 0;
            obj.command = void 0;
            obj.manifest = void 0;
          }
          if (obj.pair != null) {
            obj.unpair = void 0;
            obj.command = void 0;
            obj.manifest = void 0;
          }
          if (obj.command != null) {
            obj.unpair = void 0;
            obj.pair = void 0;
            obj.manifest = void 0;
          }
          if (obj.manifest != null) {
            obj.unpair = void 0;
            obj.pair = void 0;
            obj.command = void 0;
          }
          if (obj.manifest != null) {
            w.uint32(10);
            ext2.ManifestResponse.codec().encode(obj.manifest, w);
          }
          if (obj.command != null) {
            w.uint32(18);
            ext2.CommandResponse.codec().encode(obj.command, w);
          }
          if (obj.pair != null) {
            w.uint32(26);
            ext2.PairResponse.codec().encode(obj.pair, w);
          }
          if (obj.unpair != null) {
            w.uint32(34);
            ext2.UnpairResponse.codec().encode(obj.unpair, w);
          }
          if (opts.lengthDelimited !== false) {
            w.ldelim();
          }
        }, (r, length, opts = {}) => {
          const obj = {};
          const end = length == null ? r.len : r.pos + length;
          while (r.pos < end) {
            const tag = r.uint32();
            switch (tag >>> 3) {
              case 1: {
                obj.manifest = ext2.ManifestResponse.codec().decode(r, r.uint32(), {
                  limits: opts.limits?.manifest
                });
                break;
              }
              case 2: {
                obj.command = ext2.CommandResponse.codec().decode(r, r.uint32(), {
                  limits: opts.limits?.command
                });
                break;
              }
              case 3: {
                obj.pair = ext2.PairResponse.codec().decode(r, r.uint32(), {
                  limits: opts.limits?.pair
                });
                break;
              }
              case 4: {
                obj.unpair = ext2.UnpairResponse.codec().decode(r, r.uint32(), {
                  limits: opts.limits?.unpair
                });
                break;
              }
              default: {
                r.skipType(tag & 7);
                break;
              }
            }
          }
          if (obj.unpair != null) {
            delete obj.pair;
            delete obj.command;
            delete obj.manifest;
          }
          if (obj.pair != null) {
            delete obj.unpair;
            delete obj.command;
            delete obj.manifest;
          }
          if (obj.command != null) {
            delete obj.unpair;
            delete obj.pair;
            delete obj.manifest;
          }
          if (obj.manifest != null) {
            delete obj.unpair;
            delete obj.pair;
            delete obj.command;
          }
          return obj;
        }, function* (r, length, prefix, opts = {}) {
          const end = length == null ? r.len : r.pos + length;
          if (prefix !== ".") {
            yield {
              field: prefix.endsWith(".") ? prefix.substring(0, prefix.length - 1) : prefix,
              type: "start",
              message: "ext.Response"
            };
          }
          while (r.pos < end) {
            const tag = r.uint32();
            switch (tag >>> 3) {
              case 1: {
                yield* ext2.ManifestResponse.codec().stream(r, r.uint32(), `${prefix}manifest.`, {
                  limits: opts.limits?.manifest
                });
                break;
              }
              case 2: {
                yield* ext2.CommandResponse.codec().stream(r, r.uint32(), `${prefix}command.`, {
                  limits: opts.limits?.command
                });
                break;
              }
              case 3: {
                yield* ext2.PairResponse.codec().stream(r, r.uint32(), `${prefix}pair.`, {
                  limits: opts.limits?.pair
                });
                break;
              }
              case 4: {
                yield* ext2.UnpairResponse.codec().stream(r, r.uint32(), `${prefix}unpair.`, {
                  limits: opts.limits?.unpair
                });
                break;
              }
              default: {
                r.skipType(tag & 7);
                break;
              }
            }
          }
          if (prefix !== ".") {
            yield {
              field: prefix.endsWith(".") ? prefix.substring(0, prefix.length - 1) : prefix,
              type: "end",
              message: "ext.Response"
            };
          }
        });
      }
      return _codec2;
    };
    function encode2(obj) {
      return encodeMessage(obj, Response2.codec());
    }
    Response2.encode = encode2;
    function decode2(buf, opts) {
      return decodeMessage(buf, Response2.codec(), opts);
    }
    Response2.decode = decode2;
    function stream2(buf, opts) {
      return streamMessage(buf, Response2.codec(), opts);
    }
    Response2.stream = stream2;
  })(Response = ext2.Response || (ext2.Response = {}));
  let ManifestRequest;
  ((ManifestRequest2) => {
    let _codec2;
    ManifestRequest2.codec = () => {
      if (_codec2 == null) {
        _codec2 = message((obj, w, opts = {}) => {
          if (opts.lengthDelimited !== false) {
            w.fork();
          }
          if (obj.timestamp != null && obj.timestamp !== 0n) {
            w.uint32(8);
            w.int64(obj.timestamp);
          }
          if (opts.lengthDelimited !== false) {
            w.ldelim();
          }
        }, (r, length) => {
          const obj = {
            timestamp: 0n
          };
          const end = length == null ? r.len : r.pos + length;
          while (r.pos < end) {
            const tag = r.uint32();
            switch (tag >>> 3) {
              case 1: {
                obj.timestamp = r.int64();
                break;
              }
              default: {
                r.skipType(tag & 7);
                break;
              }
            }
          }
          return obj;
        }, function* (r, length, prefix) {
          const end = length == null ? r.len : r.pos + length;
          if (prefix !== ".") {
            yield {
              field: prefix.endsWith(".") ? prefix.substring(0, prefix.length - 1) : prefix,
              type: "start",
              message: "ext.ManifestRequest"
            };
          }
          while (r.pos < end) {
            const tag = r.uint32();
            switch (tag >>> 3) {
              case 1: {
                yield {
                  field: `${prefix}timestamp`,
                  value: r.int64()
                };
                break;
              }
              default: {
                r.skipType(tag & 7);
                break;
              }
            }
          }
          if (prefix !== ".") {
            yield {
              field: prefix.endsWith(".") ? prefix.substring(0, prefix.length - 1) : prefix,
              type: "end",
              message: "ext.ManifestRequest"
            };
          }
        });
      }
      return _codec2;
    };
    function encode2(obj) {
      return encodeMessage(obj, ManifestRequest2.codec());
    }
    ManifestRequest2.encode = encode2;
    function decode2(buf, opts) {
      return decodeMessage(buf, ManifestRequest2.codec(), opts);
    }
    ManifestRequest2.decode = decode2;
    function stream2(buf, opts) {
      return streamMessage(buf, ManifestRequest2.codec(), opts);
    }
    ManifestRequest2.stream = stream2;
  })(ManifestRequest = ext2.ManifestRequest || (ext2.ManifestRequest = {}));
  let ManifestResponse;
  ((ManifestResponse2) => {
    let _codec2;
    ManifestResponse2.codec = () => {
      if (_codec2 == null) {
        _codec2 = message((obj, w, opts = {}) => {
          if (opts.lengthDelimited !== false) {
            w.fork();
          }
          if (obj.manifest != null) {
            w.uint32(10);
            ext2.ExtensionManifest.codec().encode(obj.manifest, w);
          }
          if (obj.timestamp != null && obj.timestamp !== 0n) {
            w.uint32(16);
            w.int64(obj.timestamp);
          }
          if (opts.lengthDelimited !== false) {
            w.ldelim();
          }
        }, (r, length, opts = {}) => {
          const obj = {
            timestamp: 0n
          };
          const end = length == null ? r.len : r.pos + length;
          while (r.pos < end) {
            const tag = r.uint32();
            switch (tag >>> 3) {
              case 1: {
                obj.manifest = ext2.ExtensionManifest.codec().decode(r, r.uint32(), {
                  limits: opts.limits?.manifest
                });
                break;
              }
              case 2: {
                obj.timestamp = r.int64();
                break;
              }
              default: {
                r.skipType(tag & 7);
                break;
              }
            }
          }
          return obj;
        }, function* (r, length, prefix, opts = {}) {
          const end = length == null ? r.len : r.pos + length;
          if (prefix !== ".") {
            yield {
              field: prefix.endsWith(".") ? prefix.substring(0, prefix.length - 1) : prefix,
              type: "start",
              message: "ext.ManifestResponse"
            };
          }
          while (r.pos < end) {
            const tag = r.uint32();
            switch (tag >>> 3) {
              case 1: {
                yield* ext2.ExtensionManifest.codec().stream(r, r.uint32(), `${prefix}manifest.`, {
                  limits: opts.limits?.manifest
                });
                break;
              }
              case 2: {
                yield {
                  field: `${prefix}timestamp`,
                  value: r.int64()
                };
                break;
              }
              default: {
                r.skipType(tag & 7);
                break;
              }
            }
          }
          if (prefix !== ".") {
            yield {
              field: prefix.endsWith(".") ? prefix.substring(0, prefix.length - 1) : prefix,
              type: "end",
              message: "ext.ManifestResponse"
            };
          }
        });
      }
      return _codec2;
    };
    function encode2(obj) {
      return encodeMessage(obj, ManifestResponse2.codec());
    }
    ManifestResponse2.encode = encode2;
    function decode2(buf, opts) {
      return decodeMessage(buf, ManifestResponse2.codec(), opts);
    }
    ManifestResponse2.decode = decode2;
    function stream2(buf, opts) {
      return streamMessage(buf, ManifestResponse2.codec(), opts);
    }
    ManifestResponse2.stream = stream2;
  })(ManifestResponse = ext2.ManifestResponse || (ext2.ManifestResponse = {}));
  let CommandRequest;
  ((CommandRequest2) => {
    let _codec2;
    CommandRequest2.codec = () => {
      if (_codec2 == null) {
        _codec2 = message((obj, w, opts = {}) => {
          if (opts.lengthDelimited !== false) {
            w.fork();
          }
          if (obj.requestId != null && obj.requestId !== "") {
            w.uint32(10);
            w.string(obj.requestId);
          }
          if (obj.extensionId != null && obj.extensionId !== "") {
            w.uint32(18);
            w.string(obj.extensionId);
          }
          if (obj.command != null && obj.command !== "") {
            w.uint32(26);
            w.string(obj.command);
          }
          if (obj.args != null && obj.args.length > 0) {
            for (const value of obj.args) {
              w.uint32(34);
              w.string(value);
            }
          }
          if (obj.timestamp != null && obj.timestamp !== 0n) {
            w.uint32(40);
            w.int64(obj.timestamp);
          }
          if (obj.argsJson != null) {
            w.uint32(50);
            w.string(obj.argsJson);
          }
          if (opts.lengthDelimited !== false) {
            w.ldelim();
          }
        }, (r, length, opts = {}) => {
          const obj = {
            requestId: "",
            extensionId: "",
            command: "",
            args: [],
            timestamp: 0n
          };
          const end = length == null ? r.len : r.pos + length;
          while (r.pos < end) {
            const tag = r.uint32();
            switch (tag >>> 3) {
              case 1: {
                obj.requestId = r.string();
                break;
              }
              case 2: {
                obj.extensionId = r.string();
                break;
              }
              case 3: {
                obj.command = r.string();
                break;
              }
              case 4: {
                if (opts.limits?.args != null && obj.args.length === opts.limits.args) {
                  throw new MaxLengthError('Decode error - repeated field "args" had too many elements');
                }
                obj.args.push(r.string());
                break;
              }
              case 5: {
                obj.timestamp = r.int64();
                break;
              }
              case 6: {
                obj.argsJson = r.string();
                break;
              }
              default: {
                r.skipType(tag & 7);
                break;
              }
            }
          }
          return obj;
        }, function* (r, length, prefix, opts = {}) {
          const obj = {
            args: 0
          };
          const end = length == null ? r.len : r.pos + length;
          if (prefix !== ".") {
            yield {
              field: prefix.endsWith(".") ? prefix.substring(0, prefix.length - 1) : prefix,
              type: "start",
              message: "ext.CommandRequest"
            };
          }
          while (r.pos < end) {
            const tag = r.uint32();
            switch (tag >>> 3) {
              case 1: {
                yield {
                  field: `${prefix}requestId`,
                  value: r.string()
                };
                break;
              }
              case 2: {
                yield {
                  field: `${prefix}extensionId`,
                  value: r.string()
                };
                break;
              }
              case 3: {
                yield {
                  field: `${prefix}command`,
                  value: r.string()
                };
                break;
              }
              case 4: {
                if (opts.limits?.args != null && obj.args === opts.limits.args) {
                  throw new MaxLengthError('Streaming decode error - repeated field "args" had too many elements');
                }
                yield {
                  field: `${prefix}args[]`,
                  index: obj.args,
                  value: r.string()
                };
                obj.args++;
                break;
              }
              case 5: {
                yield {
                  field: `${prefix}timestamp`,
                  value: r.int64()
                };
                break;
              }
              case 6: {
                yield {
                  field: `${prefix}argsJson`,
                  value: r.string()
                };
                break;
              }
              default: {
                r.skipType(tag & 7);
                break;
              }
            }
          }
          if (prefix !== ".") {
            yield {
              field: prefix.endsWith(".") ? prefix.substring(0, prefix.length - 1) : prefix,
              type: "end",
              message: "ext.CommandRequest"
            };
          }
        });
      }
      return _codec2;
    };
    function encode2(obj) {
      return encodeMessage(obj, CommandRequest2.codec());
    }
    CommandRequest2.encode = encode2;
    function decode2(buf, opts) {
      return decodeMessage(buf, CommandRequest2.codec(), opts);
    }
    CommandRequest2.decode = decode2;
    function stream2(buf, opts) {
      return streamMessage(buf, CommandRequest2.codec(), opts);
    }
    CommandRequest2.stream = stream2;
  })(CommandRequest = ext2.CommandRequest || (ext2.CommandRequest = {}));
  let CommandResponse;
  ((CommandResponse2) => {
    let _codec2;
    CommandResponse2.codec = () => {
      if (_codec2 == null) {
        _codec2 = message((obj, w, opts = {}) => {
          if (opts.lengthDelimited !== false) {
            w.fork();
          }
          if (obj.requestId != null && obj.requestId !== "") {
            w.uint32(10);
            w.string(obj.requestId);
          }
          if (obj.success != null && obj.success !== false) {
            w.uint32(16);
            w.bool(obj.success);
          }
          if (obj.data != null) {
            w.uint32(26);
            w.string(obj.data);
          }
          if (obj.error != null) {
            w.uint32(34);
            w.string(obj.error);
          }
          if (obj.timestamp != null && obj.timestamp !== 0n) {
            w.uint32(40);
            w.int64(obj.timestamp);
          }
          if (obj.errorCode != null && __ErrorCodeValues[obj.errorCode] !== 0) {
            w.uint32(48);
            ext2.ErrorCode.codec().encode(obj.errorCode, w);
          }
          if (opts.lengthDelimited !== false) {
            w.ldelim();
          }
        }, (r, length) => {
          const obj = {
            requestId: "",
            success: false,
            timestamp: 0n,
            errorCode: "ERROR_UNSPECIFIED" /* ERROR_UNSPECIFIED */
          };
          const end = length == null ? r.len : r.pos + length;
          while (r.pos < end) {
            const tag = r.uint32();
            switch (tag >>> 3) {
              case 1: {
                obj.requestId = r.string();
                break;
              }
              case 2: {
                obj.success = r.bool();
                break;
              }
              case 3: {
                obj.data = r.string();
                break;
              }
              case 4: {
                obj.error = r.string();
                break;
              }
              case 5: {
                obj.timestamp = r.int64();
                break;
              }
              case 6: {
                obj.errorCode = ext2.ErrorCode.codec().decode(r);
                break;
              }
              default: {
                r.skipType(tag & 7);
                break;
              }
            }
          }
          return obj;
        }, function* (r, length, prefix) {
          const end = length == null ? r.len : r.pos + length;
          if (prefix !== ".") {
            yield {
              field: prefix.endsWith(".") ? prefix.substring(0, prefix.length - 1) : prefix,
              type: "start",
              message: "ext.CommandResponse"
            };
          }
          while (r.pos < end) {
            const tag = r.uint32();
            switch (tag >>> 3) {
              case 1: {
                yield {
                  field: `${prefix}requestId`,
                  value: r.string()
                };
                break;
              }
              case 2: {
                yield {
                  field: `${prefix}success`,
                  value: r.bool()
                };
                break;
              }
              case 3: {
                yield {
                  field: `${prefix}data`,
                  value: r.string()
                };
                break;
              }
              case 4: {
                yield {
                  field: `${prefix}error`,
                  value: r.string()
                };
                break;
              }
              case 5: {
                yield {
                  field: `${prefix}timestamp`,
                  value: r.int64()
                };
                break;
              }
              case 6: {
                yield {
                  field: `${prefix}errorCode`,
                  value: ext2.ErrorCode.codec().decode(r)
                };
                break;
              }
              default: {
                r.skipType(tag & 7);
                break;
              }
            }
          }
          if (prefix !== ".") {
            yield {
              field: prefix.endsWith(".") ? prefix.substring(0, prefix.length - 1) : prefix,
              type: "end",
              message: "ext.CommandResponse"
            };
          }
        });
      }
      return _codec2;
    };
    function encode2(obj) {
      return encodeMessage(obj, CommandResponse2.codec());
    }
    CommandResponse2.encode = encode2;
    function decode2(buf, opts) {
      return decodeMessage(buf, CommandResponse2.codec(), opts);
    }
    CommandResponse2.decode = decode2;
    function stream2(buf, opts) {
      return streamMessage(buf, CommandResponse2.codec(), opts);
    }
    CommandResponse2.stream = stream2;
  })(CommandResponse = ext2.CommandResponse || (ext2.CommandResponse = {}));
  let ErrorCode;
  ((ErrorCode2) => {
    ErrorCode2["ERROR_UNSPECIFIED"] = "ERROR_UNSPECIFIED";
    ErrorCode2["UNKNOWN_EXTENSION"] = "UNKNOWN_EXTENSION";
    ErrorCode2["UNKNOWN_COMMAND"] = "UNKNOWN_COMMAND";
    ErrorCode2["INVALID_ARGUMENTS"] = "INVALID_ARGUMENTS";
    ErrorCode2["PAIRING_REQUIRED"] = "PAIRING_REQUIRED";
    ErrorCode2["SCOPE_MISSING"] = "SCOPE_MISSING";
    ErrorCode2["GRANT_EXPIRED"] = "GRANT_EXPIRED";
    ErrorCode2["RATE_LIMITED"] = "RATE_LIMITED";
    ErrorCode2["TOO_LARGE"] = "TOO_LARGE";
    ErrorCode2["INTERNAL"] = "INTERNAL";
    ErrorCode2["UNAVAILABLE"] = "UNAVAILABLE";
    ErrorCode2["INVITATION_UNKNOWN"] = "INVITATION_UNKNOWN";
    ErrorCode2["INVITATION_EXPIRED"] = "INVITATION_EXPIRED";
    ErrorCode2["INVITATION_USED"] = "INVITATION_USED";
    ErrorCode2["PAIRING_PROOF_INVALID"] = "PAIRING_PROOF_INVALID";
    ErrorCode2["SCOPE_NOT_OFFERED"] = "SCOPE_NOT_OFFERED";
    ErrorCode2["DID_SIGNATURE_INVALID"] = "DID_SIGNATURE_INVALID";
    ErrorCode2["PAIRING_DENIED"] = "PAIRING_DENIED";
    ErrorCode2["PAIRING_DISABLED"] = "PAIRING_DISABLED";
    ErrorCode2["PAIRING_UNKNOWN"] = "PAIRING_UNKNOWN";
    ErrorCode2["COMMITMENT_MISMATCH"] = "COMMITMENT_MISMATCH";
  })(ErrorCode = ext2.ErrorCode || (ext2.ErrorCode = {}));
  let __ErrorCodeValues;
  ((__ErrorCodeValues2) => {
    __ErrorCodeValues2[__ErrorCodeValues2["ERROR_UNSPECIFIED"] = 0] = "ERROR_UNSPECIFIED";
    __ErrorCodeValues2[__ErrorCodeValues2["UNKNOWN_EXTENSION"] = 1] = "UNKNOWN_EXTENSION";
    __ErrorCodeValues2[__ErrorCodeValues2["UNKNOWN_COMMAND"] = 2] = "UNKNOWN_COMMAND";
    __ErrorCodeValues2[__ErrorCodeValues2["INVALID_ARGUMENTS"] = 3] = "INVALID_ARGUMENTS";
    __ErrorCodeValues2[__ErrorCodeValues2["PAIRING_REQUIRED"] = 4] = "PAIRING_REQUIRED";
    __ErrorCodeValues2[__ErrorCodeValues2["SCOPE_MISSING"] = 5] = "SCOPE_MISSING";
    __ErrorCodeValues2[__ErrorCodeValues2["GRANT_EXPIRED"] = 6] = "GRANT_EXPIRED";
    __ErrorCodeValues2[__ErrorCodeValues2["RATE_LIMITED"] = 7] = "RATE_LIMITED";
    __ErrorCodeValues2[__ErrorCodeValues2["TOO_LARGE"] = 8] = "TOO_LARGE";
    __ErrorCodeValues2[__ErrorCodeValues2["INTERNAL"] = 9] = "INTERNAL";
    __ErrorCodeValues2[__ErrorCodeValues2["UNAVAILABLE"] = 10] = "UNAVAILABLE";
    __ErrorCodeValues2[__ErrorCodeValues2["INVITATION_UNKNOWN"] = 20] = "INVITATION_UNKNOWN";
    __ErrorCodeValues2[__ErrorCodeValues2["INVITATION_EXPIRED"] = 21] = "INVITATION_EXPIRED";
    __ErrorCodeValues2[__ErrorCodeValues2["INVITATION_USED"] = 22] = "INVITATION_USED";
    __ErrorCodeValues2[__ErrorCodeValues2["PAIRING_PROOF_INVALID"] = 23] = "PAIRING_PROOF_INVALID";
    __ErrorCodeValues2[__ErrorCodeValues2["SCOPE_NOT_OFFERED"] = 24] = "SCOPE_NOT_OFFERED";
    __ErrorCodeValues2[__ErrorCodeValues2["DID_SIGNATURE_INVALID"] = 25] = "DID_SIGNATURE_INVALID";
    __ErrorCodeValues2[__ErrorCodeValues2["PAIRING_DENIED"] = 26] = "PAIRING_DENIED";
    __ErrorCodeValues2[__ErrorCodeValues2["PAIRING_DISABLED"] = 27] = "PAIRING_DISABLED";
    __ErrorCodeValues2[__ErrorCodeValues2["PAIRING_UNKNOWN"] = 28] = "PAIRING_UNKNOWN";
    __ErrorCodeValues2[__ErrorCodeValues2["COMMITMENT_MISMATCH"] = 29] = "COMMITMENT_MISMATCH";
  })(__ErrorCodeValues || (__ErrorCodeValues = {}));
  ((ErrorCode2) => {
    ErrorCode2.codec = () => {
      return enumeration(__ErrorCodeValues);
    };
  })(ErrorCode = ext2.ErrorCode || (ext2.ErrorCode = {}));
  let PairRequest;
  ((PairRequest2) => {
    let _codec2;
    PairRequest2.codec = () => {
      if (_codec2 == null) {
        _codec2 = message((obj, w, opts = {}) => {
          if (opts.lengthDelimited !== false) {
            w.fork();
          }
          if (obj.extensionId != null && obj.extensionId !== "") {
            w.uint32(10);
            w.string(obj.extensionId);
          }
          if (obj.invitationId != null && obj.invitationId !== "") {
            w.uint32(18);
            w.string(obj.invitationId);
          }
          if (obj.scopes != null && obj.scopes.length > 0) {
            for (const value of obj.scopes) {
              w.uint32(26);
              w.string(value);
            }
          }
          if (obj.proof != null && obj.proof.byteLength > 0) {
            w.uint32(34);
            w.bytes(obj.proof);
          }
          if (obj.label != null && obj.label !== "") {
            w.uint32(42);
            w.string(obj.label);
          }
          if (obj.did != null && obj.did !== "") {
            w.uint32(50);
            w.string(obj.did);
          }
          if (obj.didProof != null) {
            w.uint32(58);
            ext2.DidProof.codec().encode(obj.didProof, w);
          }
          if (obj.timestamp != null && obj.timestamp !== 0n) {
            w.uint32(64);
            w.int64(obj.timestamp);
          }
          if (obj.commitment != null && obj.commitment.byteLength > 0) {
            w.uint32(74);
            w.bytes(obj.commitment);
          }
          if (obj.nonce != null && obj.nonce.byteLength > 0) {
            w.uint32(82);
            w.bytes(obj.nonce);
          }
          if (obj.pairingId != null && obj.pairingId !== "") {
            w.uint32(90);
            w.string(obj.pairingId);
          }
          if (opts.lengthDelimited !== false) {
            w.ldelim();
          }
        }, (r, length, opts = {}) => {
          const obj = {
            extensionId: "",
            invitationId: "",
            scopes: [],
            proof: uint8ArrayAlloc(0),
            label: "",
            did: "",
            timestamp: 0n,
            commitment: uint8ArrayAlloc(0),
            nonce: uint8ArrayAlloc(0),
            pairingId: ""
          };
          const end = length == null ? r.len : r.pos + length;
          while (r.pos < end) {
            const tag = r.uint32();
            switch (tag >>> 3) {
              case 1: {
                obj.extensionId = r.string();
                break;
              }
              case 2: {
                obj.invitationId = r.string();
                break;
              }
              case 3: {
                if (opts.limits?.scopes != null && obj.scopes.length === opts.limits.scopes) {
                  throw new MaxLengthError('Decode error - repeated field "scopes" had too many elements');
                }
                obj.scopes.push(r.string());
                break;
              }
              case 4: {
                obj.proof = r.bytes();
                break;
              }
              case 5: {
                obj.label = r.string();
                break;
              }
              case 6: {
                obj.did = r.string();
                break;
              }
              case 7: {
                obj.didProof = ext2.DidProof.codec().decode(r, r.uint32(), {
                  limits: opts.limits?.didProof
                });
                break;
              }
              case 8: {
                obj.timestamp = r.int64();
                break;
              }
              case 9: {
                obj.commitment = r.bytes();
                break;
              }
              case 10: {
                obj.nonce = r.bytes();
                break;
              }
              case 11: {
                obj.pairingId = r.string();
                break;
              }
              default: {
                r.skipType(tag & 7);
                break;
              }
            }
          }
          return obj;
        }, function* (r, length, prefix, opts = {}) {
          const obj = {
            scopes: 0
          };
          const end = length == null ? r.len : r.pos + length;
          if (prefix !== ".") {
            yield {
              field: prefix.endsWith(".") ? prefix.substring(0, prefix.length - 1) : prefix,
              type: "start",
              message: "ext.PairRequest"
            };
          }
          while (r.pos < end) {
            const tag = r.uint32();
            switch (tag >>> 3) {
              case 1: {
                yield {
                  field: `${prefix}extensionId`,
                  value: r.string()
                };
                break;
              }
              case 2: {
                yield {
                  field: `${prefix}invitationId`,
                  value: r.string()
                };
                break;
              }
              case 3: {
                if (opts.limits?.scopes != null && obj.scopes === opts.limits.scopes) {
                  throw new MaxLengthError('Streaming decode error - repeated field "scopes" had too many elements');
                }
                yield {
                  field: `${prefix}scopes[]`,
                  index: obj.scopes,
                  value: r.string()
                };
                obj.scopes++;
                break;
              }
              case 4: {
                yield {
                  field: `${prefix}proof`,
                  value: r.bytes()
                };
                break;
              }
              case 5: {
                yield {
                  field: `${prefix}label`,
                  value: r.string()
                };
                break;
              }
              case 6: {
                yield {
                  field: `${prefix}did`,
                  value: r.string()
                };
                break;
              }
              case 7: {
                yield* ext2.DidProof.codec().stream(r, r.uint32(), `${prefix}didProof.`, {
                  limits: opts.limits?.didProof
                });
                break;
              }
              case 8: {
                yield {
                  field: `${prefix}timestamp`,
                  value: r.int64()
                };
                break;
              }
              case 9: {
                yield {
                  field: `${prefix}commitment`,
                  value: r.bytes()
                };
                break;
              }
              case 10: {
                yield {
                  field: `${prefix}nonce`,
                  value: r.bytes()
                };
                break;
              }
              case 11: {
                yield {
                  field: `${prefix}pairingId`,
                  value: r.string()
                };
                break;
              }
              default: {
                r.skipType(tag & 7);
                break;
              }
            }
          }
          if (prefix !== ".") {
            yield {
              field: prefix.endsWith(".") ? prefix.substring(0, prefix.length - 1) : prefix,
              type: "end",
              message: "ext.PairRequest"
            };
          }
        });
      }
      return _codec2;
    };
    function encode2(obj) {
      return encodeMessage(obj, PairRequest2.codec());
    }
    PairRequest2.encode = encode2;
    function decode2(buf, opts) {
      return decodeMessage(buf, PairRequest2.codec(), opts);
    }
    PairRequest2.decode = decode2;
    function stream2(buf, opts) {
      return streamMessage(buf, PairRequest2.codec(), opts);
    }
    PairRequest2.stream = stream2;
  })(PairRequest = ext2.PairRequest || (ext2.PairRequest = {}));
  let DidProof;
  ((DidProof2) => {
    let Format;
    ((Format2) => {
      Format2["FORMAT_UNSPECIFIED"] = "FORMAT_UNSPECIFIED";
      Format2["RAW"] = "RAW";
      Format2["WEBAUTHN"] = "WEBAUTHN";
    })(Format = DidProof2.Format || (DidProof2.Format = {}));
    let __FormatValues;
    ((__FormatValues2) => {
      __FormatValues2[__FormatValues2["FORMAT_UNSPECIFIED"] = 0] = "FORMAT_UNSPECIFIED";
      __FormatValues2[__FormatValues2["RAW"] = 1] = "RAW";
      __FormatValues2[__FormatValues2["WEBAUTHN"] = 2] = "WEBAUTHN";
    })(__FormatValues || (__FormatValues = {}));
    ((Format2) => {
      Format2.codec = () => {
        return enumeration(__FormatValues);
      };
    })(Format = DidProof2.Format || (DidProof2.Format = {}));
    let _codec2;
    DidProof2.codec = () => {
      if (_codec2 == null) {
        _codec2 = message((obj, w, opts = {}) => {
          if (opts.lengthDelimited !== false) {
            w.fork();
          }
          if (obj.format != null && __FormatValues[obj.format] !== 0) {
            w.uint32(8);
            ext2.DidProof.Format.codec().encode(obj.format, w);
          }
          if (obj.signature != null && obj.signature.byteLength > 0) {
            w.uint32(18);
            w.bytes(obj.signature);
          }
          if (obj.authenticatorData != null && obj.authenticatorData.byteLength > 0) {
            w.uint32(26);
            w.bytes(obj.authenticatorData);
          }
          if (obj.clientDataJSON != null && obj.clientDataJSON.byteLength > 0) {
            w.uint32(34);
            w.bytes(obj.clientDataJSON);
          }
          if (opts.lengthDelimited !== false) {
            w.ldelim();
          }
        }, (r, length) => {
          const obj = {
            format: "FORMAT_UNSPECIFIED" /* FORMAT_UNSPECIFIED */,
            signature: uint8ArrayAlloc(0),
            authenticatorData: uint8ArrayAlloc(0),
            clientDataJSON: uint8ArrayAlloc(0)
          };
          const end = length == null ? r.len : r.pos + length;
          while (r.pos < end) {
            const tag = r.uint32();
            switch (tag >>> 3) {
              case 1: {
                obj.format = ext2.DidProof.Format.codec().decode(r);
                break;
              }
              case 2: {
                obj.signature = r.bytes();
                break;
              }
              case 3: {
                obj.authenticatorData = r.bytes();
                break;
              }
              case 4: {
                obj.clientDataJSON = r.bytes();
                break;
              }
              default: {
                r.skipType(tag & 7);
                break;
              }
            }
          }
          return obj;
        }, function* (r, length, prefix) {
          const end = length == null ? r.len : r.pos + length;
          if (prefix !== ".") {
            yield {
              field: prefix.endsWith(".") ? prefix.substring(0, prefix.length - 1) : prefix,
              type: "start",
              message: "ext.DidProof"
            };
          }
          while (r.pos < end) {
            const tag = r.uint32();
            switch (tag >>> 3) {
              case 1: {
                yield {
                  field: `${prefix}format`,
                  value: ext2.DidProof.Format.codec().decode(r)
                };
                break;
              }
              case 2: {
                yield {
                  field: `${prefix}signature`,
                  value: r.bytes()
                };
                break;
              }
              case 3: {
                yield {
                  field: `${prefix}authenticatorData`,
                  value: r.bytes()
                };
                break;
              }
              case 4: {
                yield {
                  field: `${prefix}clientDataJSON`,
                  value: r.bytes()
                };
                break;
              }
              default: {
                r.skipType(tag & 7);
                break;
              }
            }
          }
          if (prefix !== ".") {
            yield {
              field: prefix.endsWith(".") ? prefix.substring(0, prefix.length - 1) : prefix,
              type: "end",
              message: "ext.DidProof"
            };
          }
        });
      }
      return _codec2;
    };
    function encode2(obj) {
      return encodeMessage(obj, DidProof2.codec());
    }
    DidProof2.encode = encode2;
    function decode2(buf, opts) {
      return decodeMessage(buf, DidProof2.codec(), opts);
    }
    DidProof2.decode = decode2;
    function stream2(buf, opts) {
      return streamMessage(buf, DidProof2.codec(), opts);
    }
    DidProof2.stream = stream2;
  })(DidProof = ext2.DidProof || (ext2.DidProof = {}));
  let PairResponse;
  ((PairResponse2) => {
    let Status;
    ((Status2) => {
      Status2["STATUS_UNSPECIFIED"] = "STATUS_UNSPECIFIED";
      Status2["GRANTED"] = "GRANTED";
      Status2["PENDING"] = "PENDING";
      Status2["DENIED"] = "DENIED";
    })(Status = PairResponse2.Status || (PairResponse2.Status = {}));
    let __StatusValues;
    ((__StatusValues2) => {
      __StatusValues2[__StatusValues2["STATUS_UNSPECIFIED"] = 0] = "STATUS_UNSPECIFIED";
      __StatusValues2[__StatusValues2["GRANTED"] = 1] = "GRANTED";
      __StatusValues2[__StatusValues2["PENDING"] = 2] = "PENDING";
      __StatusValues2[__StatusValues2["DENIED"] = 3] = "DENIED";
    })(__StatusValues || (__StatusValues = {}));
    ((Status2) => {
      Status2.codec = () => {
        return enumeration(__StatusValues);
      };
    })(Status = PairResponse2.Status || (PairResponse2.Status = {}));
    let _codec2;
    PairResponse2.codec = () => {
      if (_codec2 == null) {
        _codec2 = message((obj, w, opts = {}) => {
          if (opts.lengthDelimited !== false) {
            w.fork();
          }
          if (obj.status != null && __StatusValues[obj.status] !== 0) {
            w.uint32(8);
            ext2.PairResponse.Status.codec().encode(obj.status, w);
          }
          if (obj.grantId != null && obj.grantId !== "") {
            w.uint32(18);
            w.string(obj.grantId);
          }
          if (obj.scopes != null && obj.scopes.length > 0) {
            for (const value of obj.scopes) {
              w.uint32(26);
              w.string(value);
            }
          }
          if (obj.expiresAt != null && obj.expiresAt !== 0n) {
            w.uint32(32);
            w.int64(obj.expiresAt);
          }
          if (obj.errorCode != null && __ErrorCodeValues[obj.errorCode] !== 0) {
            w.uint32(40);
            ext2.ErrorCode.codec().encode(obj.errorCode, w);
          }
          if (obj.error != null && obj.error !== "") {
            w.uint32(50);
            w.string(obj.error);
          }
          if (obj.retryAfterMs != null && obj.retryAfterMs !== 0n) {
            w.uint32(56);
            w.int64(obj.retryAfterMs);
          }
          if (obj.pairingId != null && obj.pairingId !== "") {
            w.uint32(66);
            w.string(obj.pairingId);
          }
          if (obj.nonce != null && obj.nonce.byteLength > 0) {
            w.uint32(74);
            w.bytes(obj.nonce);
          }
          if (opts.lengthDelimited !== false) {
            w.ldelim();
          }
        }, (r, length, opts = {}) => {
          const obj = {
            status: "STATUS_UNSPECIFIED" /* STATUS_UNSPECIFIED */,
            grantId: "",
            scopes: [],
            expiresAt: 0n,
            errorCode: "ERROR_UNSPECIFIED" /* ERROR_UNSPECIFIED */,
            error: "",
            retryAfterMs: 0n,
            pairingId: "",
            nonce: uint8ArrayAlloc(0)
          };
          const end = length == null ? r.len : r.pos + length;
          while (r.pos < end) {
            const tag = r.uint32();
            switch (tag >>> 3) {
              case 1: {
                obj.status = ext2.PairResponse.Status.codec().decode(r);
                break;
              }
              case 2: {
                obj.grantId = r.string();
                break;
              }
              case 3: {
                if (opts.limits?.scopes != null && obj.scopes.length === opts.limits.scopes) {
                  throw new MaxLengthError('Decode error - repeated field "scopes" had too many elements');
                }
                obj.scopes.push(r.string());
                break;
              }
              case 4: {
                obj.expiresAt = r.int64();
                break;
              }
              case 5: {
                obj.errorCode = ext2.ErrorCode.codec().decode(r);
                break;
              }
              case 6: {
                obj.error = r.string();
                break;
              }
              case 7: {
                obj.retryAfterMs = r.int64();
                break;
              }
              case 8: {
                obj.pairingId = r.string();
                break;
              }
              case 9: {
                obj.nonce = r.bytes();
                break;
              }
              default: {
                r.skipType(tag & 7);
                break;
              }
            }
          }
          return obj;
        }, function* (r, length, prefix, opts = {}) {
          const obj = {
            scopes: 0
          };
          const end = length == null ? r.len : r.pos + length;
          if (prefix !== ".") {
            yield {
              field: prefix.endsWith(".") ? prefix.substring(0, prefix.length - 1) : prefix,
              type: "start",
              message: "ext.PairResponse"
            };
          }
          while (r.pos < end) {
            const tag = r.uint32();
            switch (tag >>> 3) {
              case 1: {
                yield {
                  field: `${prefix}status`,
                  value: ext2.PairResponse.Status.codec().decode(r)
                };
                break;
              }
              case 2: {
                yield {
                  field: `${prefix}grantId`,
                  value: r.string()
                };
                break;
              }
              case 3: {
                if (opts.limits?.scopes != null && obj.scopes === opts.limits.scopes) {
                  throw new MaxLengthError('Streaming decode error - repeated field "scopes" had too many elements');
                }
                yield {
                  field: `${prefix}scopes[]`,
                  index: obj.scopes,
                  value: r.string()
                };
                obj.scopes++;
                break;
              }
              case 4: {
                yield {
                  field: `${prefix}expiresAt`,
                  value: r.int64()
                };
                break;
              }
              case 5: {
                yield {
                  field: `${prefix}errorCode`,
                  value: ext2.ErrorCode.codec().decode(r)
                };
                break;
              }
              case 6: {
                yield {
                  field: `${prefix}error`,
                  value: r.string()
                };
                break;
              }
              case 7: {
                yield {
                  field: `${prefix}retryAfterMs`,
                  value: r.int64()
                };
                break;
              }
              case 8: {
                yield {
                  field: `${prefix}pairingId`,
                  value: r.string()
                };
                break;
              }
              case 9: {
                yield {
                  field: `${prefix}nonce`,
                  value: r.bytes()
                };
                break;
              }
              default: {
                r.skipType(tag & 7);
                break;
              }
            }
          }
          if (prefix !== ".") {
            yield {
              field: prefix.endsWith(".") ? prefix.substring(0, prefix.length - 1) : prefix,
              type: "end",
              message: "ext.PairResponse"
            };
          }
        });
      }
      return _codec2;
    };
    function encode2(obj) {
      return encodeMessage(obj, PairResponse2.codec());
    }
    PairResponse2.encode = encode2;
    function decode2(buf, opts) {
      return decodeMessage(buf, PairResponse2.codec(), opts);
    }
    PairResponse2.decode = decode2;
    function stream2(buf, opts) {
      return streamMessage(buf, PairResponse2.codec(), opts);
    }
    PairResponse2.stream = stream2;
  })(PairResponse = ext2.PairResponse || (ext2.PairResponse = {}));
  let UnpairRequest;
  ((UnpairRequest2) => {
    let _codec2;
    UnpairRequest2.codec = () => {
      if (_codec2 == null) {
        _codec2 = message((obj, w, opts = {}) => {
          if (opts.lengthDelimited !== false) {
            w.fork();
          }
          if (obj.grantId != null && obj.grantId !== "") {
            w.uint32(10);
            w.string(obj.grantId);
          }
          if (obj.timestamp != null && obj.timestamp !== 0n) {
            w.uint32(16);
            w.int64(obj.timestamp);
          }
          if (opts.lengthDelimited !== false) {
            w.ldelim();
          }
        }, (r, length) => {
          const obj = {
            grantId: "",
            timestamp: 0n
          };
          const end = length == null ? r.len : r.pos + length;
          while (r.pos < end) {
            const tag = r.uint32();
            switch (tag >>> 3) {
              case 1: {
                obj.grantId = r.string();
                break;
              }
              case 2: {
                obj.timestamp = r.int64();
                break;
              }
              default: {
                r.skipType(tag & 7);
                break;
              }
            }
          }
          return obj;
        }, function* (r, length, prefix) {
          const end = length == null ? r.len : r.pos + length;
          if (prefix !== ".") {
            yield {
              field: prefix.endsWith(".") ? prefix.substring(0, prefix.length - 1) : prefix,
              type: "start",
              message: "ext.UnpairRequest"
            };
          }
          while (r.pos < end) {
            const tag = r.uint32();
            switch (tag >>> 3) {
              case 1: {
                yield {
                  field: `${prefix}grantId`,
                  value: r.string()
                };
                break;
              }
              case 2: {
                yield {
                  field: `${prefix}timestamp`,
                  value: r.int64()
                };
                break;
              }
              default: {
                r.skipType(tag & 7);
                break;
              }
            }
          }
          if (prefix !== ".") {
            yield {
              field: prefix.endsWith(".") ? prefix.substring(0, prefix.length - 1) : prefix,
              type: "end",
              message: "ext.UnpairRequest"
            };
          }
        });
      }
      return _codec2;
    };
    function encode2(obj) {
      return encodeMessage(obj, UnpairRequest2.codec());
    }
    UnpairRequest2.encode = encode2;
    function decode2(buf, opts) {
      return decodeMessage(buf, UnpairRequest2.codec(), opts);
    }
    UnpairRequest2.decode = decode2;
    function stream2(buf, opts) {
      return streamMessage(buf, UnpairRequest2.codec(), opts);
    }
    UnpairRequest2.stream = stream2;
  })(UnpairRequest = ext2.UnpairRequest || (ext2.UnpairRequest = {}));
  let UnpairResponse;
  ((UnpairResponse2) => {
    let _codec2;
    UnpairResponse2.codec = () => {
      if (_codec2 == null) {
        _codec2 = message((obj, w, opts = {}) => {
          if (opts.lengthDelimited !== false) {
            w.fork();
          }
          if (obj.success != null && obj.success !== false) {
            w.uint32(8);
            w.bool(obj.success);
          }
          if (obj.errorCode != null && __ErrorCodeValues[obj.errorCode] !== 0) {
            w.uint32(16);
            ext2.ErrorCode.codec().encode(obj.errorCode, w);
          }
          if (opts.lengthDelimited !== false) {
            w.ldelim();
          }
        }, (r, length) => {
          const obj = {
            success: false,
            errorCode: "ERROR_UNSPECIFIED" /* ERROR_UNSPECIFIED */
          };
          const end = length == null ? r.len : r.pos + length;
          while (r.pos < end) {
            const tag = r.uint32();
            switch (tag >>> 3) {
              case 1: {
                obj.success = r.bool();
                break;
              }
              case 2: {
                obj.errorCode = ext2.ErrorCode.codec().decode(r);
                break;
              }
              default: {
                r.skipType(tag & 7);
                break;
              }
            }
          }
          return obj;
        }, function* (r, length, prefix) {
          const end = length == null ? r.len : r.pos + length;
          if (prefix !== ".") {
            yield {
              field: prefix.endsWith(".") ? prefix.substring(0, prefix.length - 1) : prefix,
              type: "start",
              message: "ext.UnpairResponse"
            };
          }
          while (r.pos < end) {
            const tag = r.uint32();
            switch (tag >>> 3) {
              case 1: {
                yield {
                  field: `${prefix}success`,
                  value: r.bool()
                };
                break;
              }
              case 2: {
                yield {
                  field: `${prefix}errorCode`,
                  value: ext2.ErrorCode.codec().decode(r)
                };
                break;
              }
              default: {
                r.skipType(tag & 7);
                break;
              }
            }
          }
          if (prefix !== ".") {
            yield {
              field: prefix.endsWith(".") ? prefix.substring(0, prefix.length - 1) : prefix,
              type: "end",
              message: "ext.UnpairResponse"
            };
          }
        });
      }
      return _codec2;
    };
    function encode2(obj) {
      return encodeMessage(obj, UnpairResponse2.codec());
    }
    UnpairResponse2.encode = encode2;
    function decode2(buf, opts) {
      return decodeMessage(buf, UnpairResponse2.codec(), opts);
    }
    UnpairResponse2.decode = decode2;
    function stream2(buf, opts) {
      return streamMessage(buf, UnpairResponse2.codec(), opts);
    }
    UnpairResponse2.stream = stream2;
  })(UnpairResponse = ext2.UnpairResponse || (ext2.UnpairResponse = {}));
  let _codec;
  ext2.codec = () => {
    if (_codec == null) {
      _codec = message((obj, w, opts = {}) => {
        if (opts.lengthDelimited !== false) {
          w.fork();
        }
        if (opts.lengthDelimited !== false) {
          w.ldelim();
        }
      }, (r, length) => {
        const obj = {};
        const end = length == null ? r.len : r.pos + length;
        while (r.pos < end) {
          const tag = r.uint32();
          switch (tag >>> 3) {
            default: {
              r.skipType(tag & 7);
              break;
            }
          }
        }
        return obj;
      }, function* (r, length, prefix) {
        const end = length == null ? r.len : r.pos + length;
        if (prefix !== ".") {
          yield {
            field: prefix.endsWith(".") ? prefix.substring(0, prefix.length - 1) : prefix,
            type: "start",
            message: "ext"
          };
        }
        while (r.pos < end) {
          const tag = r.uint32();
          switch (tag >>> 3) {
            default: {
              r.skipType(tag & 7);
              break;
            }
          }
        }
        if (prefix !== ".") {
          yield {
            field: prefix.endsWith(".") ? prefix.substring(0, prefix.length - 1) : prefix,
            type: "end",
            message: "ext"
          };
        }
      });
    }
    return _codec;
  };
  function encode(obj) {
    return encodeMessage(obj, ext2.codec());
  }
  ext2.encode = encode;
  function decode(buf, opts) {
    return decodeMessage(buf, ext2.codec(), opts);
  }
  ext2.decode = decode;
  function stream(buf, opts) {
    return streamMessage(buf, ext2.codec(), opts);
  }
  ext2.stream = stream;
})(ext || (ext = {}));
export {
  ext
};
