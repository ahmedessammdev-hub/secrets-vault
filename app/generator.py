import math
import secrets
import string
import base64
from typing import Dict, Any

# Built-in word list for diceware-style passphrase generation
WORD_LIST = [
    "ability", "able", "aboard", "about", "above", "accept", "accident", "accord", "account", "acid",
    "across", "act", "action", "active", "actor", "actual", "adapt", "add", "address", "adjust",
    "admit", "adopt", "advance", "advantage", "adventure", "advice", "affair", "affect", "afford", "afraid",
    "after", "afternoon", "again", "against", "age", "agency", "agent", "ago", "agree", "agreement",
    "ahead", "air", "alarm", "album", "alert", "alike", "alive", "allow", "almost", "alone",
    "along", "aloud", "already", "also", "alter", "always", "amaze", "ambition", "among", "amount",
    "amuse", "ancient", "angel", "anger", "angle", "angry", "animal", "ankle", "announce", "annoy",
    "annual", "another", "answer", "anxiety", "any", "apart", "apology", "appear", "apple", "apply",
    "appoint", "approve", "arch", "area", "argue", "arm", "army", "around", "arrange", "arrest",
    "arrive", "arrow", "art", "article", "artist", "ash", "ashamed", "aside", "ask", "asleep",
    "aspect", "assist", "assume", "astonish", "attack", "attempt", "attend", "attract", "aunt", "author",
    "auto", "autumn", "avail", "average", "avoid", "awake", "award", "aware", "away", "awful",
    "baby", "back", "bad", "bag", "bake", "balance", "ball", "band", "bank", "bar",
    "bare", "bargain", "bark", "barrel", "barrier", "base", "basic", "basin", "basket", "bath",
    "battle", "bay", "beach", "beam", "bean", "bear", "beard", "beast", "beat", "beauty",
    "because", "become", "bed", "beef", "before", "beg", "begin", "behave", "behind", "being",
    "belief", "believe", "bell", "belong", "below", "belt", "bench", "bend", "beneath", "benefit",
    "berry", "beside", "best", "better", "between", "beyond", "bicycle", "bid", "big", "bill",
    "bind", "bird", "birth", "bit", "bite", "bitter", "black", "blade", "blame", "blank",
    "blast", "blaze", "bleed", "blend", "bless", "blind", "block", "blood", "bloom", "blot",
    "blow", "blue", "board", "boast", "boat", "body", "boil", "bold", "bolt", "bomb",
    "bond", "bone", "book", "boot", "border", "bore", "borrow", "bosom", "boss", "both",
    "bother", "bottle", "bottom", "bound", "bow", "bowl", "box", "boy", "brain", "brake",
    "branch", "brass", "brave", "bread", "break", "breast", "breath", "breathe", "breed", "brick",
    "bridge", "brief", "bright", "brilliant", "bring", "broad", "broadcast", "brother", "brown", "brush",
    "bubble", "bucket", "build", "bulb", "bullet", "bundle", "burn", "burst", "bury", "bush",
    "business", "busy", "but", "butter", "button", "buy", "cabin", "cable", "cage", "cake",
    "calculate", "call", "calm", "camera", "camp", "campaign", "canal", "candy", "cannon", "cap",
    "capable", "capacity", "capital", "captain", "capture", "car", "card", "care", "career", "carpet",
    "carriage", "carry", "cart", "case", "cash", "cast", "castle", "cat", "catch", "cattle",
    "cause", "caution", "cave", "cease", "ceiling", "celebrate", "cell", "cent", "center", "century",
    "cereal", "certain", "chain", "chair", "chalk", "challenge", "chamber", "chance", "change", "channel",
    "chaos", "chapter", "charge", "charity", "charm", "chart", "chase", "chat", "cheap", "check",
    "cheek", "cheer", "cheese", "chemical", "chest", "chicken", "chief", "child", "chill", "chin",
    "choice", "choose", "chop", "church", "circle", "circus", "citizen", "city", "civil", "claim",
    "clash", "class", "classic", "clause", "claw", "clay", "clean", "clear", "clerk", "clever",
    "cliff", "climate", "climb", "clock", "close", "cloth", "cloud", "club", "clue", "coach",
    "coal", "coast", "coat", "code", "coffee", "coin", "cold", "collar", "collect", "college",
    "colony", "color", "column", "combine", "come", "comfort", "command", "commerce", "common", "company",
    "compare", "compel", "compete", "complete", "compose", "compound", "concern", "concrete", "condemn", "conduct",
    "confess", "confidence", "confirm", "conflict", "conform", "confuse", "connect", "conquer", "conscious", "consent",
    "contain", "content", "contest", "continue", "contract", "contrary", "control", "convenient", "convert", "cook",
    "cool", "copper", "copy", "cord", "core", "cork", "corn", "corner", "correct", "cost",
    "cottage", "cotton", "cough", "council", "counsel", "count", "country", "county", "couple", "courage",
    "course", "court", "cousin", "cover", "cow", "crack", "craft", "crash", "crawl", "crazy",
    "cream", "create", "creature", "credit", "creep", "crew", "crime", "crisis", "critic", "crop",
    "cross", "crowd", "crown", "cruel", "crush", "cry", "crystal", "cube", "cultivate", "culture",
    "cup", "cupboard", "cure", "curious", "curl", "current", "curse", "curtain", "curve", "cushion",
    "custom", "cut", "cycle", "daily", "damage", "damp", "dance", "danger", "dare", "dark",
    "date", "daughter", "dawn", "day", "dead", "deaf", "deal", "dear", "death", "debate",
    "debt", "decay", "deceit", "decide", "decision", "deck", "declare", "decline", "decorate", "decrease",
    "deed", "deep", "deer", "defeat", "defend", "define", "degree", "delay", "delicate", "delight",
    "deliver", "demand", "democracy", "density", "deny", "depart", "depend", "depth", "deputy", "derive",
    "desert", "deserve", "design", "desire", "desk", "despair", "destiny", "destroy", "detail", "detect",
    "develop", "device", "devil", "devote", "diamond", "diary", "dictate", "differ", "difficult", "dig",
    "dinner", "direct", "direction", "director", "dirt", "disagree", "disaster", "discipline", "discover", "discuss",
    "disease", "dish", "dismiss", "display", "distance", "distant", "distinct", "distress", "distribute", "district",
    "disturb", "ditch", "dive", "divide", "division", "doctor", "document", "dog", "dollar", "domain",
    "donkey", "door", "double", "doubt", "down", "dozen", "draft", "drag", "drain", "drake",
    "drama", "draw", "drawer", "dream", "dress", "drill", "drink", "drive", "driver", "drop",
    "drown", "drug", "drum", "drunk", "dry", "duck", "due", "dull", "during", "dust",
    "duty", "eager", "eagle", "ear", "early", "earn", "earnest", "earth", "ease", "east",
    "easy", "eat", "echo", "edge", "educate", "effect", "effort", "egg", "either", "elastic",
    "elder", "elect", "electric", "element", "elephant", "else", "embarrass", "empire", "employ", "empty",
    "enclose", "encourage", "end", "enemy", "energy", "engage", "engine", "enjoy", "enough", "enter",
    "entire", "envelope", "envy", "equal", "equip", "escape", "especially", "essay", "essential", "establish",
    "estate", "estimate", "even", "evening", "event", "ever", "every", "evidence", "evil", "exact",
    "examine", "example", "excellent", "except", "excess", "exchange", "excite", "exclude", "excuse", "execute",
    "exercise", "exhaust", "exhibit", "exist", "expand", "expect", "expense", "experience", "expert", "explain",
    "explode", "explore", "export", "expose", "express", "extend", "extent", "external", "extra", "extreme",
    "eye", "face", "facility", "fact", "factor", "factory", "fade", "fail", "failure", "faint",
    "fair", "faith", "fall", "false", "fame", "familiar", "family", "famous", "fancy", "far",
    "fare", "farm", "fashion", "fast", "fasten", "fat", "fate", "father", "fault", "favor",
    "favorite", "fear", "feast", "feather", "feature", "federal", "fee", "feed", "feel", "fellow",
    "female", "fence", "fertile", "fever", "few", "fiber", "field", "fierce", "fight", "figure",
    "file", "fill", "film", "filter", "final", "finance", "find", "fine", "finger", "finish",
    "fire", "firm", "first", "fish", "fist", "fit", "fix", "flag", "flame", "flash",
    "flat", "flavor", "flee", "fleet", "flesh", "flight", "float", "flock", "flood", "floor",
    "flour", "flow", "flower", "fluid", "fly", "focus", "fog", "fold", "folk", "follow",
    "fond", "food", "fool", "foot", "force", "foreign", "forest", "forever", "forget", "forgive",
    "fork", "form", "formal", "former", "forth", "fortune", "forward", "foster", "found", "fountain",
    "fox", "fraction", "frame", "free", "freedom", "freeze", "freight", "french", "frequency", "fresh",
    "friction", "friend", "fright", "frog", "from", "front", "frost", "fruit", "fuel", "full",
    "fun", "function", "fund", "fundamental", "funny", "fur", "furnish", "further", "future", "gain",
    "galaxy", "gallery", "game", "gap", "garage", "garden", "garlic", "gas", "gate", "gather",
    "gear", "general", "generate", "generous", "gentle", "genuine", "geography", "gesture", "ghost", "giant",
    "gift", "girl", "give", "glad", "glance", "glass", "globe", "gloom", "glory", "glove",
    "glow", "glue", "goal", "goat", "gold", "golden", "golf", "good", "goose", "govern",
    "grace", "grade", "gradual", "grain", "grand", "grant", "grape", "graph", "grasp", "grass",
    "grateful", "grave", "gray", "great", "greedy", "green", "greet", "grief", "grip", "groan",
    "grocery", "gross", "ground", "group", "grove", "grow", "growth", "guard", "guess", "guest",
    "guide", "guilt", "gulf", "gun", "habit", "hair", "half", "hall", "halt", "hammer",
    "hand", "handle", "hang", "happen", "happy", "harbor", "hard", "hardly", "harm", "harmony",
    "harvest", "haste", "hat", "hate", "haunt", "have", "hazard", "head", "heal", "health",
    "heap", "hear", "heart", "heat", "heaven", "heavy", "hedge", "heel", "height", "heir",
    "helicopter", "hell", "hello", "helmet", "help", "helpful", "hence", "herald", "herb", "herd",
    "here", "hero", "hesitate", "hide", "high", "highway", "hill", "hint", "hire", "history",
    "hit", "hive", "hold", "hole", "holiday", "hollow", "holy", "home", "honest", "honey",
    "honor", "hook", "hope", "horizon", "horn", "horror", "horse", "hospital", "host", "hot",
    "hotel", "hound", "hour", "house", "hover", "how", "huge", "human", "humble", "humor",
    "hundred", "hunger", "hunt", "hunter", "hurry", "hurt", "husband", "hut", "hydrogen", "hygiene",
    "ice", "idea", "ideal", "identify", "idle", "ignorance", "ignore", "ill", "illegal", "illness",
    "illustrate", "image", "imagine", "imitate", "immediate", "immense", "impact", "imply", "import", "impose",
    "improve", "impulse", "inch", "incident", "include", "income", "increase", "indeed", "indicate", "industry",
    "infant", "infect", "infer", "infinite", "inform", "inherit", "initial", "injure", "injury", "ink",
    "inner", "innocent", "input", "inquire", "insect", "insert", "inside", "insist", "inspect", "inspire",
    "install", "instance", "instant", "instead", "instinct", "institute", "instruct", "instrument", "insult", "insurance",
    "intellect", "intend", "intense", "intent", "interest", "internal", "interpret", "interval", "interview", "into",
    "introduce", "invade", "invent", "invest", "invite", "involve", "iron", "island", "issue", "item"
]

LOOKALIKE_CHARS = set("1lI0OoS5")


def generate_password(
    length: int = 20,
    uppercase: bool = True,
    lowercase: bool = True,
    digits: bool = True,
    symbols: bool = True,
    exclude_lookalikes: bool = False,
) -> Dict[str, Any]:
    charset = ""
    pools = []
    if lowercase:
        chars = string.ascii_lowercase
        if exclude_lookalikes:
            chars = "".join(c for c in chars if c not in LOOKALIKE_CHARS)
        if chars:
            pools.append(chars)
            charset += chars
    if uppercase:
        chars = string.ascii_uppercase
        if exclude_lookalikes:
            chars = "".join(c for c in chars if c not in LOOKALIKE_CHARS)
        if chars:
            pools.append(chars)
            charset += chars
    if digits:
        chars = string.digits
        if exclude_lookalikes:
            chars = "".join(c for c in chars if c not in LOOKALIKE_CHARS)
        if chars:
            pools.append(chars)
            charset += chars
    if symbols:
        chars = "!@#$%^&*()-_=+[]{}|;:,.<>?"
        if exclude_lookalikes:
            chars = "".join(c for c in chars if c not in LOOKALIKE_CHARS)
        if chars:
            pools.append(chars)
            charset += chars

    if not charset:
        charset = string.ascii_letters + string.digits

    length = max(8, min(128, length))

    # Guarantee at least one character from each selected pool
    result = [secrets.choice(p) for p in pools]
    while len(result) < length:
        result.append(secrets.choice(charset))

    # Cryptographically shuffle
    for i in range(len(result) - 1, 0, -1):
        j = secrets.randbelow(i + 1)
        result[i], result[j] = result[j], result[i]

    password = "".join(result)
    entropy = round(length * math.log2(len(charset)), 1)
    return {
        "password": password,
        "entropy_bits": entropy,
        "length": length,
    }


def generate_passphrase(words_count: int = 5, separator: str = "-") -> Dict[str, Any]:
    words_count = max(4, min(12, words_count))
    chosen = [secrets.choice(WORD_LIST) for _ in range(words_count)]
    passphrase = separator.join(chosen)
    entropy = round(words_count * math.log2(len(WORD_LIST)), 1)
    return {
        "passphrase": passphrase,
        "entropy_bits": entropy,
        "words_count": words_count,
    }


def generate_api_key(
    format: str = "base64url",
    bytes_length: int = 32,
    prefix: str = None,
) -> Dict[str, Any]:
    bytes_length = max(16, min(64, bytes_length))
    rand_bytes = secrets.token_bytes(bytes_length)
    if format == "hex":
        key = rand_bytes.hex()
    else:
        key = base64.urlsafe_b64encode(rand_bytes).decode("ascii").rstrip("=")

    if prefix:
        key = f"{prefix}{key}"

    entropy = round(bytes_length * 8, 1)
    return {
        "api_key": key,
        "entropy_bits": entropy,
        "format": format,
    }
