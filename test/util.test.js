import test from "ava";
import i18n from "i18n";
import { i18all } from "../src/util.js";

const de = {
  test: {
    foobar: "Dingsbums",
    foo: "Dings"
  },
  "key 1": "Blabla",
  "test key": "Test",
  new: {
    key: "new.key"
  }
};

const en = {
  test: {
    foobar: "foobar",
    foo: "foo"
  },
  "test key": "test",
  new: {
    key: "Only English translation"
  }
};

const fr = {
  test: {
    foobar: "toto"
  },
  "test key": "test key",
  new: {
    key: "new.key"
  }
};

test.before((t) => {
  i18n.configure({
    staticCatalog: { de, en, fr },
    defaultLocale: "en",
    objectNotation: true
  });
});

const i18allTest = test.macro((t, input, expected) => {
  const result = i18all(input);
  t.deepEqual(result, expected);
});

test("i18all returns english key for an unknown key", i18allTest, "not defined", { en: "not defined" });

test("i18all returns all translated languages", i18allTest, "test.foobar", {
  en: "foobar",
  de: "Dingsbums",
  fr: "toto"
});

test("i18all skips missing language translations", i18allTest, "key 1", { de: "Blabla" });

test("i18all skips missing language translations in objectNotation", i18allTest, "test.foo", {
  en: "foo",
  de: "Dings"
});

test("i18all skips non-translated languages with value == key", i18allTest, "test key", {
  en: "test",
  de: "Test"
});

test("i18all skips non-translated languages with value == key in objectNotation", i18allTest, "new.key", {
  en: "Only English translation"
});
