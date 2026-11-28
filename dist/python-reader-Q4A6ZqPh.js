import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
//#region src/enclawed/adapter/python-reader-helper.ts
const PY_READER_HELPER = `import ast
import importlib
import json
import sys
import types

# Enclawed python reader (helper). Reads Python source on standard input and
# never imports, compiles or runs it: ast.parse only. Prints one JSON object.
# Modules of the allowlist below are imported HERE (the standard library, in
# this isolated helper) to resolve what an attribute chain reaches.

MAX_REFUSALS = 4

# "pure": any attribute but the denied ones; the module object may be passed around.
# "only": just the listed attributes; the module object itself may not be used as a value.
PURE = {
    "re", "json", "json.decoder", "json.encoder", "math", "cmath", "collections", "collections.abc",
    "itertools", "functools", "operator", "string", "textwrap", "unicodedata", "base64", "binascii",
    "zlib", "gzip", "bz2", "lzma", "zipfile", "tarfile", "hashlib", "hmac", "struct", "datetime",
    "time", "calendar", "csv", "io", "difflib", "html", "html.parser", "html.entities",
    "typing", "enum", "argparse", "statistics", "decimal", "fractions", "random",
    "pprint", "copy", "heapq", "bisect", "glob", "fnmatch", "contextlib", "abc", "numbers",
    "secrets", "shlex", "traceback", "warnings", "array", "tomllib", "configparser", "keyword",
    "token", "tokenize", "ast", "__future__", "queue", "threading", "weakref", "locale", "colorsys",
    "graphlib", "zoneinfo", "mimetypes", "filecmp", "pathlib", "tempfile", "sqlite3", "stat",
    "errno", "posixpath", "os.path", "urllib.parse", "xml.etree.ElementTree", "xml.dom.minidom",
    "email", "email.utils", "email.message", "email.parser", "email.policy", "email.header",
    "quopri", "uu", "atexit", "string.templatelib", "pathlib.types",
}
ONLY = {
    "os": {
        "path", "getcwd", "getcwdb", "listdir", "scandir", "walk", "stat", "lstat", "fstat",
        "environ", "environb", "getenv", "getenvb", "sep", "altsep", "linesep", "pathsep", "curdir",
        "pardir", "extsep", "devnull", "name", "makedirs", "mkdir", "cpu_count", "process_cpu_count",
        "getpid", "getppid", "getuid", "getgid", "geteuid", "getegid", "fspath", "fsencode",
        "fsdecode", "PathLike", "access", "R_OK", "W_OK", "X_OK", "F_OK", "isatty",
        "get_terminal_size", "terminal_size", "urandom", "times", "strerror", "error", "SEEK_SET",
        "SEEK_CUR", "SEEK_END", "utime", "chdir", "readlink", "getloadavg", "sched_getaffinity",
        "read", "write", "close", "stat_result", "DirEntry", "get_blocking", "uname", "umask",
    },
    "sys": {
        "argv", "orig_argv", "stdin", "stdout", "stderr", "exit", "path", "version", "version_info",
        "platform", "maxsize", "byteorder", "getsizeof", "getrecursionlimit", "setrecursionlimit",
        "float_info", "int_info", "executable", "hexversion", "implementation",
        "stdlib_module_names", "builtin_module_names", "getdefaultencoding",
        "getfilesystemencoding", "flags", "maxunicode", "set_int_max_str_digits",
        "get_int_max_str_digits", "prefix", "base_prefix", "exec_prefix", "float_repr_style",
        "api_version", "copyright", "__stdout__", "__stderr__", "__stdin__",
    },
    "shutil": {
        "copy", "copy2", "copyfile", "copyfileobj", "copytree", "copymode", "copystat", "which",
        "disk_usage", "get_terminal_size", "SameFileError", "Error", "ignore_patterns",
    },
    "types": {"SimpleNamespace", "MappingProxyType", "GeneratorType", "NoneType", "EllipsisType"},
    "uuid": {"uuid4", "uuid3", "uuid5", "UUID", "NAMESPACE_DNS", "NAMESPACE_URL", "NAMESPACE_OID", "NAMESPACE_X500"},
    "logging": {
        "basicConfig", "getLogger", "DEBUG", "INFO", "WARNING", "WARN", "ERROR", "CRITICAL",
        "NOTSET", "info", "debug", "warning", "warn", "error", "exception", "critical", "log",
        "Logger", "Formatter", "StreamHandler", "FileHandler", "Handler", "NullHandler", "disable",
        "LoggerAdapter", "captureWarnings", "getLevelName", "Filter", "LogRecord",
    },
    "unittest": {
        "TestCase", "main", "skip", "skipIf", "skipUnless", "expectedFailure", "TextTestRunner",
        "TestSuite", "SkipTest",
    },
    "urllib": {"parse"},
    # codecs without register/unregister: a codec the run registers decodes the
    # source of a module it then imports (a coding line naming it).
    "codecs": {
        "open", "decode", "encode", "lookup", "getreader", "getwriter", "getencoder",
        "getdecoder", "getincrementalencoder", "getincrementaldecoder", "iterencode",
        "iterdecode", "EncodedFile", "BOM", "BOM_UTF8", "BOM_UTF16", "BOM_UTF16_LE",
        "BOM_UTF16_BE", "BOM_UTF32", "BOM_UTF32_LE", "BOM_UTF32_BE", "BOM_LE", "BOM_BE",
        "StreamReader", "StreamWriter", "StreamReaderWriter", "IncrementalDecoder",
        "IncrementalEncoder", "Codec", "strict_errors", "ignore_errors", "replace_errors",
        "lookup_error",
    },
    "xml": {"etree", "dom"},
    "xml.etree": {"ElementTree"},
    "xml.dom": {"minidom"},
}
POLICY = set(PURE) | set(ONLY)

# Attribute names refused on any receiver (with leading underscores ignored for module names).
DANGER_MODULE_NAMES = {
    "os", "sys", "subprocess", "socket", "ssl", "shutil", "importlib", "builtins", "builtin",
    "posix", "nt", "ctypes", "cffi", "pickle", "cpickle", "marshal", "inspect", "gc", "urllib",
    "http", "asyncio", "multiprocessing", "concurrent", "pty", "fcntl", "termios", "runpy",
    "pkgutil", "zipimport", "imp", "logging", "unittest", "mock", "pdb", "bdb", "pydoc",
    "webbrowser", "ftplib", "smtplib", "poplib", "imaplib", "telnetlib", "socketserver", "xmlrpc",
    "mmap", "shelve", "dbm", "posixsubprocess", "winapi", "signal", "select", "selectors",
    "resource", "code", "codeop", "sysconfig", "site", "platform", "requests", "codecs",
    "encodings",
} - {"code", "signal", "select", "resource", "platform"}
DANGER_ATTRS = {
    "system", "popen", "popen2", "popen3", "popen4", "spawnl", "spawnle", "spawnlp", "spawnlpe",
    "spawnv", "spawnve", "spawnvp", "spawnvpe", "posix_spawn", "posix_spawnp", "execl",
    "execle", "execlp", "execlpe", "execv", "execve", "execvp", "execvpe", "fork", "forkpty",
    "vfork", "kill", "killpg", "startfile", "dlopen", "LoadLibrary", "CDLL", "PyDLL", "WinDLL",
    "import_module", "reload", "load_module", "exec_module", "resolve_name", "get_type_hints",
    "ForwardRef", "get_annotations", "evaluate_forward_ref", "getattr_static",
    "loadTestsFromName", "loadTestsFromNames", "enable_load_extension", "load_extension",
    "dictConfig", "fileConfig", "getnode", "uuid1", "settrace", "setprofile", "addaudithook",
    "unlink", "rmdir", "removedirs", "renames", "rmtree", "symlink", "symlink_to", "hardlink_to",
    "link_to", "lchmod", "chown", "lchown", "chroot", "mkfifo", "mknod", "putenv", "unsetenv",
    "setuid", "setgid", "seteuid", "setegid", "setreuid", "setregid", "setresuid", "setresgid",
    "setgroups", "initgroups", "memfd_create", "pidfd_open", "pidfd_send_signal", "attrgetter",
    "methodcaller", "Unpickler", "run_path", "run_module", "interact", "compile_command", "exec",
    "eval", "getattr", "setattr", "delattr", "make_dataclass", "singledispatch",
    "singledispatchmethod", "rename", "chmod", "f_globals", "f_locals", "f_builtins", "f_back",
    "f_code", "tb_frame", "gi_frame", "gi_code", "cr_frame", "cr_code", "ag_frame", "ag_code",
    "func_globals", "_getframe", "_current_frames", "modules", "meta_path", "path_hooks",
    "path_importer_cache", "fdopen", "openpty", "dup2", "get_field", "move", "move_into",
    "delete", "unshare", "setns", "Formatter", "convert_field", "format_field",
    "dataclass", "make_dataclass",
}
DANGER_ATTRS_LOWER = {a.lower() for a in DANGER_ATTRS}
# Frames, and what moves or watches them, by family on any receiver: a frame
# (the guard's, the toolchain's) can be traced and made to continue at another
# line, or have its locals changed. Every way to a frame (walk_stack, walk_tb,
# tb_frame, ...), every frame attribute, and every tracing, profiling and
# monitoring entry point is refused.
FRAME_ATTRS = {
    "f_back", "f_builtins", "f_code", "f_globals", "f_locals", "f_lasti", "f_lineno",
    "f_trace", "f_trace_lines", "f_trace_opcodes", "f_generator", "tb_frame", "gi_frame",
    "cr_frame", "ag_frame", "walk_stack", "walk_tb", "currentframe", "monitoring",
    "clear_frames",
}
FRAME_FAMILY = (
    "settrace", "setprofile", "gettrace", "getprofile", "call_tracing", "traceallthreads",
    "profileallthreads", "getframe", "current_frames", "current_exceptions", "remote_exec",
)
BENIGN_DUNDER_ATTRS = {
    "__init__", "__name__", "__qualname__", "__doc__", "__module__", "__version__", "__file__",
    "__enter__", "__exit__", "__aenter__", "__aexit__", "__len__", "__iter__", "__next__",
    "__repr__", "__str__", "__eq__", "__ne__", "__hash__", "__lt__", "__le__", "__gt__", "__ge__",
    "__contains__", "__getitem__", "__setitem__", "__delitem__", "__add__", "__sub__", "__mul__",
    "__truediv__", "__floordiv__", "__mod__", "__neg__", "__bool__", "__call__", "__post_init__",
    "__slots__", "__annotations__", "__all__", "__format__", "__bytes__", "__int__", "__float__",
    "__index__", "__abs__", "__iadd__", "__radd__", "__missing__", "__dataclass_fields__",
    "__new__", "__del__", "__copy__", "__deepcopy__", "__sizeof__", "__reversed__", "__round__",
    "__rsub__", "__rmul__", "__rtruediv__", "__rfloordiv__", "__rmod__", "__pow__", "__rpow__",
    "__matmul__", "__rmatmul__", "__and__", "__or__", "__xor__", "__invert__", "__pos__",
    "__isub__", "__imul__", "__itruediv__", "__divmod__", "__lshift__", "__rshift__",
}
DENIED_NAMES = {
    "eval", "exec", "compile", "__import__", "globals", "locals", "vars", "breakpoint", "help",
    "__builtins__", "__builtin__", "__loader__", "__spec__", "__cached__", "__build_class__",
    "__path__",
}
LITERAL_ONLY_NAMES = {"getattr", "setattr", "delattr"}
BENIGN_DUNDER_NAMES = {
    "__name__", "__file__", "__doc__", "__debug__", "__package__", "__qualname__", "__module__",
    "__annotations__", "__all__", "__version__", "__author__", "__slots__", "__match_args__",
    "__hash__", "__class__",
}

out = {
    "refusals": [],
    "imports": [],
    "uses": [],
    "bindings": {},
    "syspath": [],
}


def no(node, why):
    if len(out["refusals"]) < MAX_REFUSALS:
        out["refusals"].append([getattr(node, "lineno", 0), why])


_mods = {}


def real_module(name):
    if name not in POLICY:
        return None
    if name not in _mods:
        try:
            _mods[name] = importlib.import_module(name)
        except Exception:
            _mods[name] = None
    return _mods[name]


def module_name_of(obj):
    n = getattr(obj, "__name__", None)
    if n == "posixpath":
        return "os.path"
    return n


FORBIDDEN_IDS = set()


def _forbid():
    import builtins
    import os

    for n in ("eval", "exec", "compile", "__import__", "getattr", "setattr", "delattr",
              "globals", "locals", "vars", "breakpoint", "help"):
        if hasattr(builtins, n):
            FORBIDDEN_IDS.add(id(getattr(builtins, n)))
    for n in dir(os):
        if n not in ONLY["os"] and not n.startswith("__"):
            v = getattr(os, n)
            if callable(v) and not isinstance(v, type):
                FORBIDDEN_IDS.add(id(v))
    import operator
    import string

    # string.Formatter hands the objects a format string reaches by attribute to overridable methods.
    FORBIDDEN_IDS.add(id(string.Formatter))
    import dataclasses

    # dataclasses executes source built from field names: never reached by any name.
    FORBIDDEN_IDS.add(id(dataclasses.dataclass))
    FORBIDDEN_IDS.add(id(dataclasses.make_dataclass))
    FORBIDDEN_IDS.add(id(operator.attrgetter))
    FORBIDDEN_IDS.add(id(operator.methodcaller))


_forbid()


def stripped(a):
    return a.lstrip("_").lower()


def attr_ok_generic(node, attr):
    """An attribute name refused on any receiver, or None."""
    if attr.startswith("__") and attr.endswith("__"):
        if attr not in BENIGN_DUNDER_ATTRS:
            return "it reaches the internal attribute %s" % attr
        return None
    if attr in DANGER_ATTRS or stripped(attr) in DANGER_ATTRS_LOWER:
        return "it uses %s" % attr
    if attr in FRAME_ATTRS or stripped(attr) in FRAME_ATTRS or any(w in stripped(attr) for w in FRAME_FAMILY):
        return "it reaches frames or tracing (%s)" % attr
    # Anything that evaluates (typing._eval_type, evaluate_forward_ref, ...) but ast.literal_eval.
    if "eval" in attr.lower() and attr != "literal_eval":
        return "it uses %s" % attr
    if stripped(attr) in DANGER_MODULE_NAMES:
        return "it reaches a module through the attribute %s" % attr
    return None


# ── Scope-free name tables: what each name stands for, anywhere in the module ──
# kind: ("module", dotted)       a module of the allowlist
#       ("ext", module, name)    something imported from a module outside the allowlist
#                                (a project module, read on its own): uses reported
#       ("obj",)                 a plain object of an allowlisted module
aliases = {}


def bind(node, name, kind):
    prev = aliases.get(name)
    if prev is not None and prev != kind:
        # One name for two different things: the stricter reading cannot be chosen.
        if prev[0] == "module" and prev[1] in ONLY or kind[0] == "module" and kind[1] in ONLY:
            no(node, "the name %s stands for a restricted module and something else" % name)
    aliases[name] = kind


def module_allowed_path(node, dotted):
    """import a.b.c: every prefix must be allowed (an 'only' package must list the next part)."""
    parts = dotted.split(".")
    for i in range(1, len(parts) + 1):
        pre = ".".join(parts[:i])
        if pre in POLICY:
            if pre in ONLY and i < len(parts) and parts[i] not in ONLY[pre]:
                no(node, "it imports %s" % dotted)
                return False
            continue
        if i == 1:
            return None  # not the standard library's allowlist: a project module (or refused)
        no(node, "it imports %s" % dotted)
        return False
    return True


def visit_import(node, top_level):
    if isinstance(node, ast.Import):
        for a in node.names:
            ok = module_allowed_path(node, a.name)
            if ok is False:
                continue
            if ok is None:
                out["imports"].append({"module": a.name, "level": 0, "names": None, "line": node.lineno})
                local = a.asname or a.name.split(".")[0]
                target = a.name if a.asname else a.name.split(".")[0]
                bind(node, local, ("ext", target, None))
                if top_level:
                    out["bindings"][local] = {"module": target, "restricted": False}
                continue
            out["imports"].append({"module": a.name, "level": 0, "names": None, "line": node.lineno, "std": True})
            local = a.asname or a.name.split(".")[0]
            target = a.name if a.asname else a.name.split(".")[0]
            bind(node, local, ("module", target))
            if top_level:
                out["bindings"][local] = {"module": target, "restricted": target in ONLY}
        return
    # from M import names
    mod = node.module or ""
    if node.level:
        out["imports"].append({"module": mod, "level": node.level,
                               "names": [a.name for a in node.names], "line": node.lineno})
        for a in node.names:
            if a.name == "*":
                continue
            bind(node, a.asname or a.name, ("ext", "." * node.level + mod, a.name))
            if top_level:
                out["bindings"][a.asname or a.name] = {"module": "." * node.level + mod, "name": a.name, "restricted": False}
        return
    ok = module_allowed_path(node, mod)
    if ok is False:
        return
    if ok is None:
        out["imports"].append({"module": mod, "level": 0,
                               "names": [a.name for a in node.names], "line": node.lineno})
        for a in node.names:
            if a.name == "*":
                continue
            if stripped(a.name) in DANGER_MODULE_NAMES:
                no(node, "it imports %s from %s" % (a.name, mod))
            bind(node, a.asname or a.name, ("ext", mod, a.name))
            if top_level:
                out["bindings"][a.asname or a.name] = {"module": mod, "name": a.name, "restricted": False}
        return
    out["imports"].append({"module": mod, "level": 0, "names": [a.name for a in node.names],
                           "line": node.lineno, "std": True})
    real = real_module(mod)
    for a in node.names:
        local = a.asname or a.name
        if a.name == "*":
            if mod in ONLY:
                no(node, "it imports everything from %s" % mod)
                continue
            names = getattr(real, "__all__", None) if real is not None else None
            if names is None and real is not None:
                names = [n for n in dir(real) if not n.startswith("_")]
            for n in names or []:
                v = getattr(real, n, None)
                if isinstance(v, types.ModuleType) and module_name_of(v) not in PURE:
                    no(node, "it imports everything from %s, which holds the module %s" % (mod, n))
                elif id(v) in FORBIDDEN_IDS or n in DANGER_ATTRS:
                    no(node, "it imports everything from %s, which holds %s" % (mod, n))
            continue
        if mod in ONLY and a.name not in ONLY[mod]:
            no(node, "it imports %s from %s" % (a.name, mod))
            continue
        if mod not in ONLY and a.name.startswith("_") and a.name not in BENIGN_DUNDER_ATTRS:
            no(node, "it imports the private name %s from %s" % (a.name, mod))
            continue
        if mod not in ONLY and real is not None and not hasattr(real, a.name) and "%s.%s" % (mod, a.name) not in POLICY:
            no(node, "it imports %s from %s, which Enclawed cannot resolve" % (a.name, mod))
            continue
        why = attr_ok_generic(node, a.name) if mod not in ONLY else None
        if why:
            no(node, why)
            continue
        sub = "%s.%s" % (mod, a.name)
        v = getattr(real, a.name, None) if real is not None else None
        if sub in POLICY or isinstance(v, types.ModuleType):
            name = sub if sub in POLICY else module_name_of(v)
            if name not in POLICY:
                no(node, "it imports %s" % sub)
                continue
            bind(node, local, ("module", name))
            if top_level:
                out["bindings"][local] = {"module": name, "restricted": name in ONLY}
            continue
        if id(v) in FORBIDDEN_IDS:
            no(node, "it imports %s from %s" % (a.name, mod))
            continue
        bind(node, local, ("obj",))


def collect_imports(tree):
    top = set(id(n) for n in tree.body)

    def walk(n, top_level):
        for c in ast.iter_child_nodes(n):
            if isinstance(c, (ast.Import, ast.ImportFrom)):
                visit_import(c, top_level and id(c) in top)
            # Statements directly under if/try at module level still bind module globals.
            nested_top = top_level and isinstance(c, (ast.If, ast.Try, ast.With)) or (
                top_level and hasattr(ast, "TryStar") and isinstance(c, ast.TryStar))
            if isinstance(c, (ast.If, ast.Try, ast.With)) or (hasattr(ast, "TryStar") and isinstance(c, ast.TryStar)):
                for b in ("body", "orelse", "finalbody", "handlers"):
                    for s in getattr(c, b, []) or []:
                        top.add(id(s))
            walk(c, nested_top or (top_level and isinstance(c, ast.ExceptHandler)))

    walk(tree, True)


ENCLAWED_ROOT = "/.enclawed/"


def folded(node, depth=0):
    """The string a constant expression builds (+, chr, f-strings, join), or None."""
    if depth > 50:
        return None
    if isinstance(node, ast.Constant):
        return node.value if isinstance(node.value, (str, bytes)) else None
    if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Add):
        a, b = folded(node.left, depth + 1), folded(node.right, depth + 1)
        if type(a) is type(b) and a is not None:
            return a + b
        return None
    if isinstance(node, ast.JoinedStr):
        parts = []
        for v in node.values:
            x = folded(v.value if isinstance(v, ast.FormattedValue) else v, depth + 1)
            if not isinstance(x, str):
                return None
            parts.append(x)
        return "".join(parts)
    if isinstance(node, ast.Call) and not node.keywords:
        f = node.func
        if isinstance(f, ast.Name) and f.id == "chr" and len(node.args) == 1:
            a = node.args[0]
            if isinstance(a, ast.Constant) and type(a.value) is int and 0 <= a.value < 0x110000:
                return chr(a.value)
        if isinstance(f, ast.Attribute) and f.attr == "join":
            xs = [folded(e, depth + 1) for e in node.args]
            if isinstance(f.value, ast.Attribute) and f.value.attr == "path":
                # os.path.join of constant parts
                if xs and all(isinstance(x, str) for x in xs):
                    import posixpath
                    return posixpath.join(*xs)
                return None
            sep = folded(f.value, depth + 1)
            seq = node.args[0] if len(node.args) == 1 else None
            if isinstance(sep, str) and isinstance(seq, (ast.List, ast.Tuple)):
                ys = [folded(e, depth + 1) for e in seq.elts]
                if all(isinstance(y, str) for y in ys):
                    return sep.join(ys)
    return None


def chain_of(node):
    """a.b.c -> ("a", ["b", "c"]); None when the base is not a name."""
    attrs = []
    while isinstance(node, ast.Attribute):
        attrs.append(node.attr)
        node = node.value
    if isinstance(node, ast.Name):
        return node.id, list(reversed(attrs))
    return None


class Reader(ast.NodeVisitor):
    def __init__(self):
        self.parents = {}
        self.plugin_names = set()

    def generic_visit(self, node):
        for c in ast.iter_child_nodes(node):
            self.parents[id(c)] = node
        super().generic_visit(node)

    def visit_Name(self, node):
        n = node.id
        if n == "pytest_plugins" and id(node) not in self.plugin_names:
            no(node, "it uses pytest_plugins other than as one module-level literal list")
        if n in DENIED_NAMES or (n in LITERAL_ONLY_NAMES and not self.literal_call(node)):
            no(node, "it uses %s" % n)
        elif n.startswith("__") and n.endswith("__") and n not in BENIGN_DUNDER_NAMES:
            no(node, "it uses %s" % n)
        kind = aliases.get(n)
        parent = self.parents.get(id(node))
        receiver = isinstance(parent, ast.Attribute) and parent.value is node
        # No module object as a value (an argument such as namespace=, stored,
        # returned, compared, a setattr target): what receives it may change the
        # module whose functions the toolchain itself calls.
        if kind and kind[0] == "module" and isinstance(node.ctx, ast.Load) and not receiver:
            no(node, "it uses the module %s as a value" % kind[1])
        if kind and kind[0] == "ext" and isinstance(node.ctx, ast.Load) and not receiver:
            out["uses"].append({"module": kind[1], "name": kind[2], "chain": [], "line": node.lineno, "bare": True})
        self.generic_visit(node)

    def literal_call(self, name_node):
        call = self.parents.get(id(name_node))
        if not isinstance(call, ast.Call) or call.func is not name_node:
            return False
        if len(call.args) < 2 or call.keywords or any(isinstance(a, ast.Starred) for a in call.args):
            return False
        a = call.args[1]
        if not (isinstance(a, ast.Constant) and isinstance(a.value, str)):
            return False
        why = attr_ok_generic(call, a.value)
        if why:
            return False
        base = call.args[0]
        if isinstance(base, ast.Name):
            kind = aliases.get(base.id)
            if kind and kind[0] == "module":
                # setattr/delattr on a module changes it: never.
                if name_node.id != "getattr":
                    return False
                # getattr(os, "path"): as os.path; the module itself is then not a bare value.
                if kind[1] in ONLY and a.value not in ONLY[kind[1]]:
                    return False
                self.parents[id(base)] = ast.Attribute(value=base, attr=a.value)
        return True

    def visit_Attribute(self, node):
        # Assigning or deleting any attribute reached through a module (for, with,
        # del and augmented targets included) changes that module.
        if not isinstance(node.ctx, ast.Load):
            ch = chain_of(node)
            if ch and aliases.get(ch[0], ("",))[0] == "module":
                no(node, "it changes the module %s" % aliases[ch[0]][1])
        parent = self.parents.get(id(node))
        outer = not (isinstance(parent, ast.Attribute) and parent.value is node)
        if outer:
            self.check_chain(node)
        self.generic_visit(node)

    def check_chain(self, node):
        ch = chain_of(node)
        attrs = []
        n = node
        while isinstance(n, ast.Attribute):
            attrs.append(n.attr)
            n = n.value
        attrs.reverse()
        kind = aliases.get(ch[0]) if ch else None
        if kind and kind[0] == "ext":
            out["uses"].append({"module": kind[1], "name": kind[2], "chain": attrs, "line": node.lineno})
        if not kind or kind[0] != "module":
            for a in attrs:
                why = attr_ok_generic(node, a)
                if why:
                    no(node, why)
                    return
            self.special(node, attrs, None)
            return
        cur = kind[1]
        obj = real_module(cur)
        for i, a in enumerate(attrs):
            if cur is not None:
                if cur in ONLY:
                    if a not in ONLY[cur]:
                        no(node, "it uses %s.%s" % (cur, a))
                        return
                else:
                    why = attr_ok_generic(node, a)
                    if why:
                        no(node, why)
                        return
                    # A module's private internals, or an attribute this reading cannot
                    # resolve on the module (another version, another platform): what it
                    # holds is not known, so the chain is not read as a plain value.
                    if a.startswith("_") and a not in BENIGN_DUNDER_ATTRS:
                        no(node, "it reaches the private attribute %s.%s" % (cur, a))
                        return
                    if ("%s.%s" % (cur, a)) not in POLICY and (obj is None or not hasattr(obj, a)):
                        no(node, "it uses %s.%s, which Enclawed cannot resolve" % (cur, a))
                        return
                v = getattr(obj, a, None) if obj is not None else None
                sub = "%s.%s" % (cur, a)
                if sub in POLICY or isinstance(v, types.ModuleType):
                    name = sub if sub in POLICY else module_name_of(v)
                    if name not in POLICY:
                        no(node, "it reaches the module %s" % name)
                        return
                    cur, obj = name, real_module(name)
                    continue
                if id(v) in FORBIDDEN_IDS:
                    no(node, "it uses %s.%s" % (cur, a))
                    return
                cur, obj = None, None
                continue
            why = attr_ok_generic(node, a)
            if why:
                no(node, why)
                return
        if cur is not None:
            no(node, "it uses the module %s as a value" % cur)
            return
        self.special(node, attrs, kind[1])

    def special(self, node, attrs, base_module):
        parent = self.parents.get(id(node))
        call = parent if isinstance(parent, ast.Call) and parent.func is node else None
        last = attrs[-1] if attrs else None
        # Path.replace(target) renames a file; str.replace takes two arguments.
        if last == "replace" and call is not None and len(call.args) == 1 and not call.keywords:
            no(node, "it renames a file (replace)")
        if base_module == "sys" and attrs[:1] in (["argv"], ["orig_argv"]):
            # The arguments the run was started with stay as they were.
            if len(attrs) == 1:
                if isinstance(parent, ast.Subscript) and not isinstance(parent.ctx, ast.Load):
                    no(node, "it changes sys.%s" % attrs[0])
            elif attrs[1] not in ("index", "count", "copy"):
                no(node, "it changes sys.%s" % attrs[0])
        if base_module == "sys" and attrs[:1] == ["path"]:
            if len(attrs) == 1:
                if isinstance(getattr(parent, "ctx", None), (ast.Store, ast.Del)) or isinstance(parent, (ast.AugAssign, ast.Subscript)) and not isinstance(getattr(parent, "ctx", ast.Load()), ast.Load):
                    no(node, "it changes sys.path")
                if isinstance(parent, ast.AugAssign) and parent.target is node:
                    no(node, "it changes sys.path")
            elif len(attrs) == 2 and call is not None:
                if attrs[1] in ("insert", "append"):
                    arg = call.args[-1] if call.args else None
                    if len(call.args) in (1, 2) and isinstance(arg, ast.Constant) and isinstance(arg.value, str) and not call.keywords:
                        out["syspath"].append([attrs[1], arg.value])
                    else:
                        no(node, "it changes sys.path with a value Enclawed does not read")
                elif attrs[1] not in ("index", "count", "copy"):
                    no(node, "it changes sys.path")
            elif len(attrs) == 2:
                no(node, "it reaches sys.path.%s" % attrs[1])

    def visit_Constant(self, node):
        self.enclawed_path(node, node.value)
        self.generic_visit(node)

    def visit_BinOp(self, node):
        self.enclawed_path(node, folded(node))
        self.generic_visit(node)

    def visit_JoinedStr(self, node):
        self.enclawed_path(node, folded(node))
        self.generic_visit(node)

    def enclawed_path(self, node, v):
        # The containment's own files (the guards, their pins): never read by the run.
        if isinstance(v, bytes):
            v = v.decode("latin-1")
        if isinstance(v, str) and v.startswith("/"):
            import posixpath
            n = posixpath.normpath("/" + v.lstrip("/")) + "/"
            if n.startswith(ENCLAWED_ROOT):
                no(node, "it names the containment's own files")

    def visit_MatchClass(self, node):
        # case C(attr=p): the pattern reads the attribute by name.
        for a in node.kwd_attrs:
            why = attr_ok_generic(node, a)
            if why:
                no(node, why)
        self.generic_visit(node)

    def visit_ClassDef(self, node):
        # __match_args__: names positional class patterns read by attribute.
        for st in node.body:
            if isinstance(st, (ast.Assign, ast.AnnAssign)):
                targets = st.targets if isinstance(st, ast.Assign) else [st.target]
                if any(isinstance(t, ast.Name) and t.id == "__match_args__" for t in targets):
                    v = st.value
                    if not isinstance(v, (ast.Tuple, ast.List)) or not all(
                            isinstance(e, ast.Constant) and isinstance(e.value, str) and not attr_ok_generic(e, e.value)
                            for e in v.elts):
                        no(st, "__match_args__ that is not a list of plain attribute names")
        self.generic_visit(node)

    def visit_Call(self, node):
        # unittest.main loads tests by names from its arguments or the command line.
        ch = chain_of(node.func) if isinstance(node.func, ast.Attribute) else None
        if ch and aliases.get(ch[0]) == ("module", "unittest") and ch[1] == ["main"]:
            if node.args or any(k.arg not in ("verbosity", "exit", "buffer", "failfast", "warnings") for k in node.keywords):
                no(node, "unittest.main with arguments that name tests")
            out["unittest_main"] = True
        self.enclawed_path(node, folded(node))
        self.link_making(node)
        self.generic_visit(node)

    def link_making(self, node):
        # Copies that make links as written, and archive extraction that makes
        # links where the archive says: by the called name, whatever the receiver.
        f = node.func
        name = f.attr if isinstance(f, ast.Attribute) else f.id if isinstance(f, ast.Name) else None
        if name is None:
            return
        kw = {k.arg: k.value for k in node.keywords}
        if None in kw and name in ("copy", "copy2", "copyfile", "copymode", "copystat", "copytree", "extract", "extractall"):
            no(node, "it calls %s with keyword arguments Enclawed does not read" % name)
            return
        def literal(v, want):
            return isinstance(v, ast.Constant) and v.value is want
        if name in ("copy", "copy2", "copyfile", "copymode", "copystat") and "follow_symlinks" in kw and not literal(kw["follow_symlinks"], True):
            no(node, "it copies a link as a link (%s follow_symlinks)" % name)
        if name == "copytree" and (len(node.args) > 2 or ("symlinks" in kw and not literal(kw["symlinks"], False))):
            no(node, "it copies links as links (copytree symlinks)")
        if name in ("extract", "extractall", "unpack_archive"):
            # An archive's members are files, links and names Enclawed never read
            # (a link .github -> a directory written after): no extraction runs contained.
            no(node, "it extracts an archive (its members, links among them, are not read)")

    def visit_Subscript(self, node):
        # sys.path[...] = ...: a change of the module path.
        v = node.value
        ch = chain_of(v) if isinstance(v, ast.Attribute) else None
        if ch and aliases.get(ch[0]) == ("module", "sys") and ch[1] == ["path"] and not isinstance(node.ctx, ast.Load):
            no(node, "it changes sys.path")
        self.generic_visit(node)

    def visit_Assign(self, node):
        for t in node.targets:
            self.check_target(t)
        if any(isinstance(t, ast.Name) and t.id == "pytest_plugins" for t in node.targets):
            self.pytest_plugins(node)
        self.generic_visit(node)

    def pytest_plugins(self, node):
        # pytest imports the modules a module's pytest_plugins names: read as
        # imports (the same rules), only as one module-level literal list.
        v = node.value
        items = [v] if isinstance(v, ast.Constant) else list(v.elts) if isinstance(v, (ast.List, ast.Tuple)) else None
        top = isinstance(self.parents.get(id(node)), ast.Module)
        names = [e.value for e in items or [] if isinstance(e, ast.Constant) and isinstance(e.value, str)]
        if not top or items is None or len(names) != len(items) or len(node.targets) != 1:
            no(node, "pytest_plugins that is not one module-level literal list of module names")
            return
        for m in names:
            if not m or not all(part.isidentifier() for part in m.split(".")):
                no(node, "pytest_plugins names %s, which is not a module name" % m[:60])
                continue
            imp = ast.Import(names=[ast.alias(name=m, asname=None)])
            imp.lineno = node.lineno
            visit_import(imp, False)
        self.plugin_names.add(id(node.targets[0]))

    def visit_AugAssign(self, node):
        self.check_target(node.target)
        self.generic_visit(node)

    def visit_AnnAssign(self, node):
        self.check_target(node.target)
        self.annotation(node.annotation)
        self.generic_visit(node)

    def check_target(self, t):
        if isinstance(t, ast.Name) and t.id in DENIED_NAMES:
            no(t, "it assigns %s" % t.id)
        if isinstance(t, ast.Attribute) and t.attr == "extraction_filter":
            no(t, "it changes how archives extract (extraction_filter)")
        if isinstance(t, ast.Attribute):
            ch = chain_of(t)
            if ch and aliases.get(ch[0], ("",))[0] == "module" and len(ch[1]) >= 1:
                no(t, "it changes the module %s" % aliases[ch[0]][1])

    def annotation(self, ann):
        # A string annotation is code typing may evaluate: read as an expression.
        if isinstance(ann, ast.Constant) and isinstance(ann.value, str):
            try:
                expr = ast.parse(ann.value, mode="eval")
            except SyntaxError:
                no(ann, "an annotation that is not an expression")
                return
            sub = Reader()
            sub.visit(expr)

    def visit_arg(self, node):
        if node.annotation is not None:
            self.annotation(node.annotation)
        self.generic_visit(node)

    def visit_FunctionDef(self, node):
        if node.returns is not None:
            self.annotation(node.returns)
        self.generic_visit(node)

    visit_AsyncFunctionDef = visit_FunctionDef


def main():
    src = sys.stdin.buffer.read()
    # Only the interpreter's own source encodings: a coding line naming any other
    # codec decodes through whatever codec the run registered by that name.
    import io
    import tokenize

    try:
        enc, _ = tokenize.detect_encoding(io.BytesIO(src).readline)
    except SyntaxError as e:
        print(json.dumps({"unreadable": "a source encoding Enclawed does not read (%s)" % str(e)[:80]}))
        return
    if enc not in ("utf-8", "utf-8-sig", "ascii", "iso-8859-1", "latin-1"):
        print(json.dumps({"unreadable": "a source encoding Enclawed does not read (%s)" % enc}))
        return
    if bytes([0]) in src:
        print(json.dumps({"unreadable": "a NUL byte in the source"}))
        return
    try:
        tree = ast.parse(src, filename="<code>", mode="exec")
    except (SyntaxError, ValueError) as e:
        # The interpreter that runs it parses the same way: it runs none of it.
        print(json.dumps({"syntax": str(e)[:200]}))
        return
    except (RecursionError, MemoryError, OverflowError):
        print(json.dumps({"unreadable": "nested deeper or larger than Enclawed reads"}))
        return
    try:
        collect_imports(tree)
        r = Reader()
        r.parents[id(tree)] = None
        r.visit(tree)
    except RecursionError:
        print(json.dumps({"unreadable": "nested deeper than Enclawed reads"}))
        return
    out["star"] = ["." * i["level"] + i["module"] for i in out["imports"] if i["names"] and "*" in i["names"] and not i.get("std")]
    print(json.dumps(out))


main()
`;
//#endregion
//#region src/enclawed/adapter/view-fs.ts
/** Directories of the containment that hold names this host's do not (or the containment itself). */
const VIEW_OWN = [
	"/.enclawed",
	"/proc",
	"/dev",
	"/sys"
];
const inViewOwn = (p) => VIEW_OWN.some((d) => p === d || p.startsWith(`${d}/`));
/** Places whose contents in the containment are not this host's (fresh, private, or its own home). */
const VIEW_FRESH = [
	"/tmp",
	"/var/tmp",
	"/dev/shm",
	"/run",
	"/sandbox"
];
const inViewFresh = (p) => VIEW_FRESH.some((d) => p === d || p.startsWith(`${d}/`));
/**
* Where a path a line names leads, resolved one component at a time as the
* kernel would (`..` physically, every symbolic link followed by its target),
* with the containment's view in mind: a step into Enclawed's own directory,
* /proc, /dev or /sys refuses (that is where a link like
* /proc/self/root/.enclawed/... goes); a missing name reached through a link
* into a place whose contents in the containment are not this host's (/tmp,
* /var/tmp, /dev/shm, /run, its home) refuses; any other missing name is
* "absent": the containment shows this host's project and read-only toolchain
* (a subset of it), so it has nothing there either (/bin -> usr/bin and the
* like resolve here as there).
*/
function resolveViewPath(cwd, p) {
	const parts = (p.startsWith("/") ? p : `${cwd}/${p}`).split("/");
	let cur = "/";
	let hops = 0;
	let hopFresh = false;
	const queue = parts.filter((x) => x !== "" && x !== ".");
	while (queue.length) {
		const comp = queue.shift();
		if (comp === "." || comp === "") continue;
		if (comp === "..") {
			cur = path.dirname(cur);
			continue;
		}
		const next = cur === "/" ? `/${comp}` : `${cur}/${comp}`;
		if (inViewOwn(next)) return {
			kind: "refused",
			why: `it leads into ${next}`
		};
		let st;
		try {
			st = fs.lstatSync(next);
		} catch {
			return hops > 0 && (hopFresh || inViewFresh(next)) ? {
				kind: "refused",
				why: `a link it goes through leads to ${next}, which is not here`
			} : { kind: "absent" };
		}
		if (st.isSymbolicLink()) {
			if (++hops > 40) return {
				kind: "refused",
				why: "too many links"
			};
			let target;
			try {
				target = fs.readlinkSync(next);
			} catch {
				return {
					kind: "refused",
					why: `the link ${next} cannot be read`
				};
			}
			queue.unshift(...target.split("/").filter((x) => x !== "" && x !== "."));
			if (target.startsWith("/")) {
				cur = "/";
				hopFresh ||= inViewFresh(target);
			} else hopFresh ||= inViewFresh(cur);
			continue;
		}
		if (queue.length && !st.isDirectory()) return { kind: "absent" };
		cur = next;
	}
	if (inViewOwn(cur)) return {
		kind: "refused",
		why: `it leads into ${cur}`
	};
	return {
		kind: "found",
		real: cur
	};
}
/**
* Whether `p` (from `cwd`) means one place to the kernel and another to a
* reading that takes `..` off the name: a `..` that steps back over a
* symbolic link goes, for the kernel, to the parent of the link's target. The
* link it steps back over, or null (no `..`, or none over a link).
*/
function dotDotOverLink(cwd, p) {
	if (!/(?:^|\/)\.\.(?:\/|$)/.test(p)) return null;
	const stack = [];
	for (const c of (p.startsWith("/") ? p : `${cwd}/${p}`).split("/")) {
		if (c === "" || c === ".") continue;
		if (c !== "..") {
			stack.push(c);
			continue;
		}
		if (stack.length === 0) continue;
		const here = `/${stack.join("/")}`;
		let st;
		try {
			st = fs.lstatSync(here);
		} catch {
			return null;
		}
		if (st.isSymbolicLink()) return here;
		stack.pop();
	}
	return null;
}
/** Data paths every view has (the containment's own /dev shows these the same). */
const DEVICE_DATA = new Set([
	"/dev/null",
	"/dev/zero",
	"/dev/full",
	"/dev/random",
	"/dev/urandom",
	"/dev/tty",
	"/dev/stdin",
	"/dev/stdout",
	"/dev/stderr"
]);
/** Thrown for a path the view refuses (also kept in the reading's record). */
var ViewRefused = class extends Error {};
let record = null;
/**
* Run a reading with a record of refused paths: `fn`'s result, or the first
* refusal (whatever `fn` did with the failed query).
*/
function withViewRecord(fn) {
	const outer = record;
	const mine = [];
	record = mine;
	try {
		const value = fn();
		return {
			refused: mine[0] ?? null,
			value
		};
	} finally {
		record = outer;
	}
}
function refusedPath(p, why) {
	const msg = `${p.slice(0, 120)}: ${why}`;
	record?.push(msg);
	throw new ViewRefused(msg);
}
/** Check `p` (resolved against the process cwd when relative): refused paths throw (and are recorded). */
function viewCheck(p) {
	if (typeof p === "number") return;
	const abs = path.resolve(String(p));
	if (DEVICE_DATA.has(abs)) return;
	const r = resolveViewPath("/", abs);
	if (r.kind === "refused") refusedPath(abs, r.why);
}
/** Like viewCheck, but the last component is not followed (lstat, readlink). */
function viewCheckParent(p) {
	const abs = path.resolve(String(p));
	viewCheck(path.dirname(abs));
	if (inViewOwn(abs) && !DEVICE_DATA.has(abs)) refusedPath(abs, `it leads into ${abs}`);
}
/** The readers' filesystem queries: each goes through the view first. */
const viewFs = {
	existsSync(p) {
		viewCheck(p);
		return fs.existsSync(p);
	},
	statSync(p) {
		viewCheck(p);
		return fs.statSync(p);
	},
	lstatSync(p) {
		viewCheckParent(p);
		return fs.lstatSync(p);
	},
	realpathSync(p) {
		viewCheck(p);
		return fs.realpathSync(p);
	},
	readdirNames(p) {
		viewCheck(p);
		return fs.readdirSync(p);
	},
	readdirEntries(p) {
		viewCheck(p);
		return fs.readdirSync(p, { withFileTypes: true });
	},
	readlink(p) {
		viewCheckParent(p);
		return fs.readlinkSync(p, "utf8");
	},
	readText(p) {
		viewCheck(p);
		return fs.readFileSync(p, "utf8");
	},
	readBytes(p) {
		viewCheck(p);
		return fs.readFileSync(p);
	},
	note(p) {
		try {
			viewCheck(p);
		} catch {}
	}
};
//#endregion
//#region src/enclawed/adapter/python-reader.ts
const MAX_TEXT = 512 * 1024;
const cache = /* @__PURE__ */ new Map();
/**
* Where the containment looks a program up, in order (../containment/plan.ts
* PROGRAM_DIRS and lookupProgram; a test keeps the two equal). Kept here so the
* adapter does not load the containment planner to read code.
*/
const PYTHON_PROGRAM_DIRS = [
	"/usr/local/bin",
	"/usr/bin",
	"/bin",
	"/usr/sbin",
	"/sbin"
];
function lookupProgram(name) {
	if (path.isAbsolute(name)) return viewFs.existsSync(name) ? name : null;
	if (name.includes("/")) return null;
	for (const dir of PYTHON_PROGRAM_DIRS) {
		const p = path.join(dir, name);
		try {
			const st = viewFs.statSync(p);
			if (st.isFile() && st.mode & 73) return p;
		} catch {}
	}
	return null;
}
/**
* The interpreter a contained run starts for `name` (a command name, by the
* containment's own lookup, or an absolute path from a shebang): the reading
* parses with the interpreter that runs the code, so a text it cannot parse
* is one that interpreter runs none of. null: no such program.
*/
function pythonProgram(name = "python3") {
	const p = lookupProgram(name);
	if (!p) return null;
	try {
		return viewFs.realpathSync(p);
	} catch {
		return null;
	}
}
/** The oldest Python a contained run takes: the version its guard (../containment/code-guard.ts) is verified on. */
const CONTAINED_PYTHON_MIN = [3, 14];
const versions = /* @__PURE__ */ new Map();
/**
* The version of the interpreter binary at `program` (a real path), as that
* binary reports it when run isolated (cached by the binary's identity: path,
* size, change time); null: it did not answer.
*/
function pythonVersionOf(program) {
	let key = program;
	try {
		const st = viewFs.statSync(program);
		key = `${program}\0${st.size}\0${st.mtimeMs}\0${st.ctimeMs}`;
	} catch {
		return null;
	}
	if (versions.has(key)) return versions.get(key) ?? null;
	const r = spawnSync(program, [
		"-I",
		"-S",
		"-E",
		"-c",
		"import sys;print(sys.version_info[0], sys.version_info[1])"
	], {
		encoding: "utf8",
		cwd: "/",
		env: { PATH: "/usr/bin:/bin" },
		timeout: 1e4
	});
	const m = r.status === 0 ? /^(\d+) (\d+)\s*$/.exec(r.stdout) : null;
	const v = m ? [Number(m[1]), Number(m[2])] : null;
	versions.set(key, v);
	return v;
}
function containedPythonStatus(interpreter = "python3") {
	const program = pythonProgram(interpreter);
	if (!program) return {
		program,
		version: null,
		unsupported: null
	};
	const version = pythonVersionOf(program);
	const [maj, min] = CONTAINED_PYTHON_MIN;
	if (!version) return {
		program,
		version,
		unsupported: `contained Python needs Python ${maj}.${min} or newer; Enclawed could not tell the version of ${program}`
	};
	if (version[0] < maj || version[0] === maj && version[1] < min) return {
		program,
		version,
		unsupported: `contained Python needs Python ${maj}.${min} or newer; this host has ${version[0]}.${version[1]}`
	};
	return {
		program,
		version,
		unsupported: null
	};
}
/** The helper's facts about a Python text (cached by content); null: it could not be read. */
function pythonFacts(text, interpreter = "python3") {
	const prog = pythonProgram(interpreter);
	if (text.length > MAX_TEXT || text.includes("�") || !prog) return null;
	const key = `${prog}\0${createHash("sha256").update(text).digest("hex")}`;
	if (cache.has(key)) return cache.get(key) ?? null;
	const r = spawnSync(prog, [
		"-I",
		"-S",
		"-E",
		"-B",
		"-c",
		PY_READER_HELPER
	], {
		input: text,
		encoding: "utf8",
		cwd: "/",
		env: {
			PATH: "/usr/bin:/bin",
			LC_ALL: "C.UTF-8"
		},
		timeout: 1e4,
		maxBuffer: 8 * 1024 * 1024
	});
	let facts = null;
	if (r.status === 0) try {
		facts = JSON.parse(r.stdout);
	} catch {
		facts = null;
	}
	if (cache.size > 4096) cache.clear();
	cache.set(key, facts);
	return facts;
}
let pathInfo;
/**
* Whether python3 could import a module by this name from its own path
* (standard library, lib-dynload, dist- and site-packages; not the user's
* site-packages, which a contained run does not see) or as a built-in. Not
* known (python3 cannot tell): taken to exist.
*/
function moduleExistsOutside(name, siteDirs = []) {
	for (const d of siteDirs) {
		let names = [];
		try {
			names = viewFs.readdirNames(d);
		} catch {
			continue;
		}
		if (names.some((n) => n === name || n.startsWith(`${name}.`))) return true;
	}
	if (pathInfo === void 0) {
		const r = spawnSync(pythonProgram() ?? "python3", [
			"-I",
			"-c",
			"import sys,json;print(json.dumps([sys.path,list(sys.builtin_module_names)]))"
		], {
			encoding: "utf8",
			cwd: "/",
			env: { PATH: "/usr/bin:/bin" },
			timeout: 1e4
		});
		try {
			const [dirs, builtins] = JSON.parse(r.stdout);
			pathInfo = {
				dirs: dirs.filter((d) => path.isAbsolute(d)),
				builtins: new Set(builtins)
			};
		} catch {
			pathInfo = null;
		}
	}
	if (!pathInfo || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) || pathInfo.builtins.has(name)) return true;
	for (const d of pathInfo.dirs) {
		let names = [];
		try {
			names = viewFs.readdirNames(d);
		} catch {
			continue;
		}
		if (names.some((n) => n === name || n.startsWith(`${name}.`))) return true;
	}
	return false;
}
var Refused = class extends Error {};
function refuse(why) {
	throw new Refused(why);
}
/**
* Read a Python program and everything of the project it imports. Returns
* null when it may run contained (the files it read went through io.load),
* or why not.
*
* `file`: the program's file (null for -c or standard-input code);
* `dirs`: Python's first module path entries for it (the script's
* directory, the working directory for -c and standard input; none when isolated).
*/
function readPython(text, what, file, dirs, io) {
	const st = {
		io,
		searched: [...dirs],
		byReal: /* @__PURE__ */ new Map(),
		byName: /* @__PURE__ */ new Map()
	};
	const unsupported = containedPythonStatus(io.interpreter ?? "python3").unsupported;
	if (unsupported) return unsupported;
	const outer = hostOf;
	hostOf = io.hostPath ?? ((p) => p);
	try {
		const entry = readModule(st, text, what, file, null);
		for (const m of new Set([entry, ...st.byReal.values()])) useCheck(st, m);
		return null;
	} catch (err) {
		if (err instanceof Refused) return err.message;
		throw err;
	} finally {
		hostOf = outer;
	}
}
function factsOf(text, what, interpreter) {
	const f = pythonFacts(text, interpreter);
	if (!f) refuse(`${what} could not be read as Python`);
	if ("unreadable" in f) refuse(`${what}: ${f.unreadable}`);
	if ("syntax" in f) return {
		refusals: [],
		imports: [],
		uses: [],
		bindings: {},
		syspath: [],
		star: []
	};
	const first = f.refusals[0];
	if (first) refuse(`${what}, line ${first[0]}: ${first[1]}`);
	return f;
}
let hostOf = (p) => p;
function isFile(p) {
	try {
		return viewFs.statSync(hostOf(p)).isFile();
	} catch {
		return false;
	}
}
function isDir(p) {
	try {
		return viewFs.statSync(hostOf(p)).isDirectory();
	} catch {
		return false;
	}
}
/** Compiled or packaged module forms Python would load and Enclawed cannot read. */
function compiledFormIn(dir, name) {
	let names = [];
	try {
		names = viewFs.readdirNames(hostOf(dir));
	} catch {
		return false;
	}
	return names.some((n) => n === `${name}.pyc` || n === `${name}.pyw` || n === `${name}.pth` || n.startsWith(`${name}.`) && /\.(?:so|pyd)$/.test(n) || n === `${name}.zip`);
}
/**
* The file a module part resolves to in `dir`: a .py file or a package's
* __init__.py; { file: null } for a directory without __init__.py (a
* namespace package part, whose other parts may be anywhere on the path,
* the toolchain's included); null: not there.
*/
function moduleFileIn(dir, name) {
	const pkg = path.join(dir, name);
	if (isDir(pkg)) {
		const init = path.join(pkg, "__init__.py");
		if (isFile(init)) return {
			file: init,
			pkgDir: pkg
		};
		if (isFile(`${pkg}.py`)) return {
			file: `${pkg}.py`,
			pkgDir: null
		};
		return {
			file: null,
			pkgDir: pkg
		};
	}
	if (isFile(`${pkg}.py`)) return {
		file: `${pkg}.py`,
		pkgDir: null
	};
	if (compiledFormIn(dir, name)) refuse(`it imports ${name}, a compiled module Enclawed cannot read`);
	return null;
}
function load(st, file, pkgDir, name) {
	const { real, text } = st.io.load(file);
	const known = st.byReal.get(real);
	if (known) {
		if (name && !st.byName.has(name)) st.byName.set(name, known);
		return known;
	}
	return readModule(st, text, st.io.show(real), real, pkgDir, name);
}
function readModule(st, text, what, real, pkgDir, name = null) {
	st.io.checkText(text, what);
	const facts = factsOf(text, what, st.io.interpreter ?? "python3");
	if (facts.unittest_main && (st.io.programArgs ?? []).some((a) => !a.startsWith("-"))) refuse(`${what} runs unittest.main, which loads the tests its arguments name`);
	const mod = {
		real: real ?? "",
		pkgDir,
		facts,
		name
	};
	if (real) st.byReal.set(real, mod);
	if (name) st.byName.set(name, mod);
	for (const [op, dir] of facts.syspath) {
		const d = path.resolve(st.io.cwd, dir || ".");
		if (!isDir(d)) refuse(`${what} puts ${dir || "."} on sys.path, which is not a directory Enclawed reads`);
		if (op === "insert") st.searched.unshift(d);
		else st.searched.push(d);
	}
	const here = real ? path.dirname(real) : null;
	for (const imp of facts.imports) {
		if (imp.level > 0) {
			if (!here) refuse(`${what} has a relative import outside a package`);
			let base = pkgDir ?? here;
			for (let i = 1; i < imp.level; i++) base = path.dirname(base);
			const parts = imp.module ? imp.module.split(".") : [];
			fromNames(st, importParts(st, base, parts, `.${imp.module}`, what, true), imp.names ?? []);
			continue;
		}
		const parts = imp.module.split(".");
		let found = null;
		for (const d of st.searched) {
			const first = moduleFileIn(d, parts[0]);
			if (first?.file === null) {
				if (imp.std) continue;
				refuse(`${what} imports ${parts[0]}, a directory Enclawed does not read as a module`);
			}
			if (first) {
				if (imp.std) refuse(`${what} imports ${parts[0]}, which a project file shadows`);
				found = importParts(st, d, parts, imp.module, what, false);
				break;
			}
		}
		if (!found) {
			if (imp.std) continue;
			if (st.io.runnerModules?.includes(parts[0])) continue;
			if (moduleExistsOutside(parts[0], st.io.siteDirs ?? [])) refuse(`${what} imports ${imp.module}, a module whose code Enclawed does not read`);
			continue;
		}
		if (imp.names) fromNames(st, found, imp.names);
	}
	return mod;
}
/** Load a.b.c from `base` (each package's __init__ and the last part), returning the last module. */
function importParts(st, base, parts, dotted, what, relative) {
	let dir = base;
	let mod = null;
	if (parts.length === 0) {
		const init = path.join(base, "__init__.py");
		if (!isFile(init)) refuse(`${what} imports from a package Enclawed does not read`);
		return load(st, init, base, null);
	}
	const names = [];
	for (const p of parts) {
		names.push(p);
		const at = moduleFileIn(dir, p);
		if (!at || at.file === null) refuse(`${what} imports ${dotted}, which Enclawed cannot find in the project as a module`);
		mod = load(st, at.file, at.pkgDir, relative ? null : names.join("."));
		if (at.pkgDir === null) {
			if (names.length < parts.length) refuse(`${what} imports ${dotted}, below a module that is not a package`);
			break;
		}
		dir = at.pkgDir;
	}
	return mod;
}
/** `from M import a, b`: a submodule of a package is read too; a restricted binding of M is refused. */
function fromNames(st, mod, names) {
	for (const n of names) {
		if (n === "*") {
			if (tainted(st, mod, /* @__PURE__ */ new Set())) refuse(`it imports everything from ${st.io.show(mod.real)}, which holds a restricted module`);
			continue;
		}
		const b = mod.facts.bindings[n];
		if (b?.restricted) refuse(`it imports ${n} from ${st.io.show(mod.real)}, which is the module ${b.module}`);
		if (mod.pkgDir) {
			const sub = moduleFileIn(mod.pkgDir, n);
			if (sub?.file) load(st, sub.file, sub.pkgDir, null);
		}
	}
}
/** Whether a module holds (or reaches through its project modules) a restricted module. */
function tainted(st, mod, seen) {
	if (seen.has(mod)) return false;
	seen.add(mod);
	for (const b of Object.values(mod.facts.bindings)) {
		if (b.restricted) return true;
		const target = targetOf(st, mod, b.module, b.name ?? null);
		if (target && tainted(st, target, seen)) return true;
	}
	if (mod.pkgDir) {
		for (const m of st.byReal.values()) if (m !== mod && isInside(mod.pkgDir, m.real) && tainted(st, m, seen)) return true;
	}
	return false;
}
function isInside(dir, p) {
	const rel = path.relative(dir, p);
	return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}
/** The project module a binding of `mod` stands for (module, or module + name that is a submodule), or null. */
function targetOf(st, mod, module, name) {
	let m = null;
	if (module.startsWith(".")) {
		const level = module.length - module.replace(/^\.+/, "").length;
		let base = mod.pkgDir ?? path.dirname(mod.real);
		for (let i = 1; i < level; i++) base = path.dirname(base);
		const rest = module.slice(level);
		const file = rest ? [path.join(base, ...rest.split("."), "__init__.py"), `${path.join(base, ...rest.split("."))}.py`].find(isFile) : path.join(base, "__init__.py");
		m = file ? st.byReal.get(file) ?? null : null;
	} else m = st.byName.get(module) ?? null;
	if (m && name !== null) {
		if (m.pkgDir) {
			const sub = [path.join(m.pkgDir, name, "__init__.py"), path.join(m.pkgDir, `${name}.py`)].find(isFile);
			const sm = sub ? st.byReal.get(sub) : void 0;
			if (sm) return sm;
		}
		const b = m.facts.bindings[name];
		return b && !b.restricted ? targetOf(st, m, b.module, b.name ?? null) : null;
	}
	return m;
}
/**
* Every use of a name imported from a project module: an attribute chain
* through it may not reach a restricted binding, and a module that holds one
* (itself or through its project modules) may not be used as a value.
*/
function useCheck(st, mod) {
	for (const u of mod.facts.uses) {
		let cur = targetOf(st, mod, u.module, null);
		if (!cur) continue;
		const chain = u.name !== null ? [u.name, ...u.chain] : [...u.chain];
		let i = 0;
		for (; i < chain.length && cur; i++) {
			const a = chain[i];
			const b = cur.facts.bindings[a];
			if (b?.restricted) refuse(`${st.io.show(mod.real || "the code")}, line ${u.line}: it reaches the module ${b.module} through ${st.io.show(cur.real)}`);
			cur = nextOf(st, cur, a);
		}
		if (u.bare && i === chain.length && cur && tainted(st, cur, /* @__PURE__ */ new Set())) refuse(`${st.io.show(mod.real || "the code")}, line ${u.line}: it passes around ${st.io.show(cur.real)}, which holds a restricted module`);
	}
}
/** The project module `cur.a` stands for (a submodule or a binding to a project module), or null. */
function nextOf(st, cur, a) {
	if (cur.pkgDir) {
		const sub = [path.join(cur.pkgDir, a, "__init__.py"), path.join(cur.pkgDir, `${a}.py`)].find(isFile);
		const sm = sub ? st.byReal.get(sub) : void 0;
		if (sm) return sm;
	}
	const b = cur.facts.bindings[a];
	return b && !b.restricted ? targetOf(st, cur, b.module, b.name ?? null) : null;
}
//#endregion
export { readPython as a, viewFs as c, pythonFacts as i, withViewRecord as l, PYTHON_PROGRAM_DIRS as n, dotDotOverLink as o, containedPythonStatus as r, resolveViewPath as s, CONTAINED_PYTHON_MIN as t };
