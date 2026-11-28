// enclawed adapter kit: the Python side of ./python-reader.ts.
//
// Run by the system's python3 with -I -S -E -B in /, the text to read on its
// standard input. It parses the text with ast and walks the tree; it never
// imports, compiles or runs the text. The modules of its allowlist are
// imported here (the standard library, in this isolated helper) only to see
// what an attribute chain through them reaches. It prints one JSON object:
// what it refuses, the imports (the standard library's marked std), the uses
// of names imported from other modules, the module's top-level import
// bindings, literal sys.path changes and star imports.
//
// Keep this text free of backticks, dollar-brace and backslashes (it is a
// template literal).

export const PY_READER_HELPER = `import ast
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
