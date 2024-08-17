import test from "ava";
import i18n from "i18n";
import { convertProntoToGlobalCache, i18all } from "../src/util.js";

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

const prontoToGc = test.macro((t, input, expected) => {
  const result = convertProntoToGlobalCache(input);
  t.is(result, expected);
});

test(
  "Pronto without 1st burst pair is correctly converted",
  prontoToGc,
  "0000 006D 0000 0020 000A 001E 000A 0046 000A 001E 000A 001E 000A 001E 000A 001E 000A 001E 000A 001E 000A 001E 000A 0046 000A 0046 000A 0046 000A 0046 000A 001E 000A 001E 000A 0679 000A 001E 000A 0046 000A 001E 000A 001E 000A 001E 000A 0046 000A 0046 000A 0046 000A 0046 000A 001E 000A 001E 000A 001E 000A 001E 000A 0046 000A 0046 000A 0679",
  "38029,1,1,10,30,10,70,10,30,10,30,10,30,10,30,10,30,10,30,10,30,10,70,10,70,10,70,10,70,10,30,10,30,10,1657,10,30,10,70,10,30,10,30,10,30,10,70,10,70,10,70,10,70,10,30,10,30,10,30,10,30,10,70,10,70,10,1657"
);

test(
  "Pronto with space separator and repeat sequence is correctly converted",
  prontoToGc,
  "0000 006D 0022 0002 0155 00AB 0015 0015 0015 0015 0015 0015 0015 0015 0015 0015 0015 0015 0015 0015 0015 003F 0015 0015 0015 003F 0015 003F 0015 003F 0015 003F 0015 003F 0015 003F 0015 0015 0015 0015 0015 003F 0015 003F 0015 0015 0015 0015 0015 003F 0015 0015 0015 0015 0015 003F 0015 0015 0015 0015 0015 003F 0015 003F 0015 0015 0015 003F 0015 003F 0015 0626 0155 0055 0015 0E4C",
  "38029,1,69,341,171,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,63,21,21,21,63,21,63,21,63,21,63,21,63,21,63,21,21,21,21,21,63,21,63,21,21,21,21,21,63,21,21,21,21,21,63,21,21,21,21,21,63,21,63,21,21,21,63,21,63,21,1574,341,85,21,3660"
);

test(
  "Pronto with comma separator and repeat sequence is correctly converted",
  prontoToGc,
  "0000,006D,0022,0002,0155,00AB,0015,0015,0015,0015,0015,0015,0015,0015,0015,0015,0015,0015,0015,0015,0015,003F,0015,0015,0015,003F,0015,003F,0015,003F,0015,003F,0015,003F,0015,003F,0015,0015,0015,0015,0015,003F,0015,003F,0015,0015,0015,0015,0015,003F,0015,0015,0015,0015,0015,003F,0015,0015,0015,0015,0015,003F,0015,003F,0015,0015,0015,003F,0015,003F,0015,0626,0155,0055,0015,0E4C",
  "38029,1,69,341,171,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,63,21,21,21,63,21,63,21,63,21,63,21,63,21,63,21,21,21,21,21,63,21,63,21,21,21,21,21,63,21,21,21,21,21,63,21,21,21,21,21,63,21,63,21,21,21,63,21,63,21,1574,341,85,21,3660"
);

test(
  "Pronto conversion",
  prontoToGc,
  "0000 006D 0000 0033 0083 0041 0010 0010 0010 0010 0010 0031 0010 0010 0010 0031 0010 0010 0010 0031 0010 0010 0010 0010 0010 0031 0010 0010 0010 0010 0010 0031 0010 0031 0010 0010 0010 0010 0010 0010 0010 0010 0010 0010 0010 0010 0010 0031 0010 0010 0010 0031 0010 0010 0010 0031 0010 0010 0010 0010 0010 0010 0010 0031 0010 0031 0010 0010 0010 0010 0010 0010 0010 0010 0010 0010 0010 0010 0010 0010 0010 0010 0010 0031 0010 0010 0010 0031 0010 0010 0010 0010 0010 0010 0010 0010 0010 0031 0010 0010 0010 0010 0010 09ba 0000 05b9",
  "38029,1,1,131,65,16,16,16,16,16,49,16,16,16,49,16,16,16,49,16,16,16,16,16,49,16,16,16,16,16,49,16,49,16,16,16,16,16,16,16,16,16,16,16,16,16,49,16,16,16,49,16,16,16,49,16,16,16,16,16,16,16,49,16,49,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,49,16,16,16,49,16,16,16,16,16,16,16,16,16,49,16,16,16,16,16,2490,0,1465"
);
