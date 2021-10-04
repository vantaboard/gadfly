/** @OnlyCurrentDoc */

/** Triggered when the document is opened. */
const onOpen = () => {
  const doc: GoogleAppsScript.Document.DocumentApp = DocumentApp;
  const ui: GoogleAppsScript.Base.Ui = doc.getUi();
  ui.createMenu('Gadfly').addItem('Add definitions', 'mutateDefinitions').addToUi();
};

/** Triggered when the addon is installed. */
const onInstall = (e: any) => {
  onOpen();
};

/** Number of words before warning */
const warningCount = 5;

// MediaWiki types

// https://www.mediawiki.org/w/api.php?action=help&modules=query
/** Fetch data from and about MediaWiki. */
type MediaWikiActionQuery = 'query';
/** Output data in JSON format. */
type MediaWikiFormatJSON = 'json';
/** Output data in JSON format (pretty-print in HTML). */
type MediaWikiFormatJSONFM = 'jsonfm';
/** Output nothing. */
type MediaWikiFormatNone = 'none';
/** Output data in serialized PHP format. */
type MediaWikiFormatPHP = 'php';
/** Output data in serialized PHP format (pretty-print in HTML). */
type MediaWikiFormatPHPFM = 'phpfm';
/**
 * Output data, including debugging elements,
 * in JSON format (pretty-print in HTML).
 */
type MediaWikiFormatRawFM = 'rawfm';
/** Output data in XML format. */
type MediaWikiFormatXML = 'xml';
/** Output data in XML format (pretty-print in HTML). */
type MediaWikiFormatXMLFM = 'xmlfm';

// https://www.mediawiki.org/w/api.php?action=help&modules=query%2Bsearch
/** Perform a full text search. */
type MediaWikiListSearch = 'search';

// https://www.mediawiki.org/w/api.php?action=help&modules=query%2Bextracts
/** Returns plain-text or limited HTML extracts of the given pages. */
type MediaWikiPropExtracts = 'extracts';

/** No formatting. */
type MediaWikiPropExSectionFormatPlain = 'plain';

/** Wikitext-style formatting (== like this ==). */
type MediaWikiPropExSectionFormatWiki = 'wiki';

/**
 * This module's internal representation (section titles prefixed with
 * <ASCII 1><ASCII 2><section level><ASCII 2><ASCII 1>).
 */
type MediaWikiPropExSectionFormatRaw = 'raw';

interface MediaWikiSharedParams {
  /**
   * When accessing the API using a cross-domain AJAX request (CORS), set this
   * to the originating domain. This must be included in any pre-flight request,
   * and therefore must be part of the request URI (not the POST body).
   *
   * For authenticated requests, this must match one of the origins in the
   * Origin header exactly, so it has to be set to something like
   * https://en.wikipedia.org or https://meta.wikimedia.org. If this parameter
   * does not match the Origin header, a 403 response will be returned. If this
   * parameter matches the Origin header and the origin is allowed, the
   * ```Access-Control-Allow-Origin``` and
   * ```Access-Control-Allow-Credentials``` headers will be set.
   *
   * For non-authenticated requests, specify the value *. This will cause the
   * ```Access-Control-Allow-Origin``` header to be set, but
   * ```Access-Control-Allow-Credentials``` will be false and all user-specific
   * data will be restricted.
   */
  origin: string | '*';
  /** Which action to perform. */
  action: MediaWikiActionQuery;
  /** The format of the output. */
  format:
    | MediaWikiFormatJSON
    | MediaWikiFormatJSONFM
    | MediaWikiFormatNone
    | MediaWikiFormatPHP
    | MediaWikiFormatPHPFM
    | MediaWikiFormatRawFM
    | MediaWikiFormatXML
    | MediaWikiFormatXMLFM;
  /**
   * Encodes most (but not all) non-ASCII characters as UTF-8 instead of
   * replacing them with hexadecimal escape sequences.
   */
  utf8?: 0 | 1;
}

interface MediaWikiPageIDsParams extends MediaWikiSharedParams {
  /** Which lists to get. */
  list: MediaWikiListSearch;
  /**
   * Search for page titles or content matching this value. You can use the
   * search string to invoke special search features, depending on what the
   * wiki's search backend implements.
   */
  srsearch: string;
}

interface MediaWikiExtractParams extends MediaWikiSharedParams {
  /** Which properties to get for the queried pages. */
  prop?: MediaWikiPropExtracts;
  /** A list of page IDs to work on. */
  pageids?: string[];
  /** How many sentences to return. */
  exsentences?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
  /** Return only content before the first section. */
  exintro?: 0 | 1;
  /** Return extracts as plain text instead of limited HTML. */
  explaintext?: 0 | 1;
  /** How to format sections in plaintext mode. */
  exsectionformat:
    | MediaWikiPropExSectionFormatPlain
    | MediaWikiPropExSectionFormatWiki
    | MediaWikiPropExSectionFormatRaw;
}

class Definition {
  /** entry point for MediaWiki API */
  #apiEntry: string;
  /** Definitions to extract for later usage */
  #extract: string;

  constructor(t: string) {
    this.#apiEntry = 'https://en.wikipedia.org/w/api.php?';
    const term: string = this.#formatTerm(t);

    const pageIDs: string[] = this.#getPageIDs(term);
    const selectedPageID: string = pageIDs[0];

    // ask the user to check or uncheck certain options / make corrections

    this.#extract = this.#getExtract(selectedPageID);

    const notFound: RegExp = RegExp(`${t} may refer to|${t}\\sor\\s.*may refer to`, 'gi');
    if (this.#extract.match(notFound) || !this.#extract) {
      this.#extract = 'COULD NOT FIND DEFINITION :(';
    }
  }

  #formatTerm = (term: string): string => {
    return term
      .toLowerCase()
      .replace(/\s/g, '%20')
      .replace(/^[^A-Z0-9]*/gi, '');
  };

  #getPageIDs = (term: string): string[] => {
    const pageIDsParams: MediaWikiPageIDsParams = {
      origin: '*',
      action: 'query',
      format: 'json',
      list: 'search',
      utf8: 1,
      srsearch: term,
    };

    const request: string = this.#request(this.#apiEntry, pageIDsParams);
    const response: string = this.#fetch(request, term);
    return this.#parsePageIDs(response);
  };

  #parsePageIDs = (data: string): string[] => {
    const search: string[] = JSON.parse(data)?.query?.search;
    const pageids: string[] = [];
    search.forEach((arr) => {
      Object.entries(arr).forEach((pair: [string, string]) => {
        const [key, value] = pair;
        if (key === 'pageid') {
          pageids.push(String(value));
        }
      });
    });
    return pageids;
  };

  #getExtract = (id: string): string => {
    const extractParams: MediaWikiExtractParams = {
      origin: '*',
      action: 'query',
      format: 'json',
      prop: 'extracts',
      pageids: [id],
      utf8: 1,
      exsentences: 10,
      exintro: 1,
      explaintext: 1,
      exsectionformat: 'plain',
    };

    const request: string = this.#request(this.#apiEntry, extractParams);
    const response: string = this.#fetch(request, id);
    return this.#parseExtract(response);
  };

  #formatExtract = (extract: string) => {
    const stripSentencesNewLines = extract?.replace(/\.\s?\\n.*|\n.*/g, '');
    const stripSentences = stripSentencesNewLines?.replace(/(?<=\.)\s[^a-z].*/g, '');
    const parenCount: number | undefined = stripSentences?.match(/\(/)?.length;
    const parentheses = RegExp(`\\((?<=\\()(.+?(?=\\))\\)){1,${parenCount || ''}}`, 'gi');
    const noParenthesesPairs = stripSentences?.replace(parentheses, '');
    const noParentheses = noParenthesesPairs?.replace(/\(|\)/g, '');
    const noDoubleSpaces = noParentheses?.replace(/\s{2,}/g, ' ');
    const noEscapedQuotes = noDoubleSpaces?.replace(/\\"/g, '"');
    const noSpaceCommas = noEscapedQuotes?.replace(/\s{1,},/g, ',');
    const noSpacePeriods = noSpaceCommas?.replace(/\s{1,}\./g, '.');
    return noSpacePeriods;
  };

  #parseExtract = (request: string): string => {
    const json = JSON.parse(request)?.query?.pages;
    const pageid = Object.keys(json)[0];
    const extract = json[pageid].extract;
    return this.#formatExtract(extract);
  };

  #request = (url: string, params: MediaWikiPageIDsParams | MediaWikiExtractParams) => {
    let _url: string = url;
    const entries = Object.entries(params);
    for (let i = 0; i < entries.length; ++i) {
      const [param, value] = entries[i];
      _url += `${param}=${value}`;
      if (i !== entries.length) {
        _url += '&';
      }
    }
    return _url;
  };

  #fetch = (url: string, cacheKey: string, shouldCache: boolean = true): string => {
    const cache: GoogleAppsScript.Cache.Cache = CacheService.getScriptCache();
    if (shouldCache) {
      const cached: string | null = cache.get(cacheKey);
      if (cached) return cached;
    }

    const response = UrlFetchApp.fetch(url).getContentText();

    // expire in a month
    const expiration: number = this.#toSeconds('1 month');

    if (shouldCache) {
      cache.put(cacheKey, response, expiration);
    }
    return response;
  };

  #toSeconds = (date: string) => {
    const conversions = {
      year: 1,
      month: 12,
      day: 30,
      hour: 24,
      minute: 60,
      second: 60,
    };

    let _date = date.trim();
    let value = Number(_date.replace(/^\d*|\x/, ''));

    _date = _date.replace(/\d*|\s/, '');

    let match: boolean = false;
    for (const [unit, factor] of Object.entries(conversions)) {
      let _factor = 1;
      if (_date.match(RegExp(unit))) {
        match = true;
      } else {
        _factor = factor;
      }

      if (match) {
        value *= _factor;
      }
    }

    return value;
  };

  getExtract = () => this.#extract;
}

const getRegExpPointers = (regex: RegExp): GoogleAppsScript.Document.Paragraph[] => {
  const doc: GoogleAppsScript.Document.DocumentApp = DocumentApp;
  const activeDoc = doc.getActiveDocument();
  const body: GoogleAppsScript.Document.Body = activeDoc.getBody();
  const paragraphs: GoogleAppsScript.Document.Paragraph[] = body.getParagraphs();

  return paragraphs.filter((_) => {
    return _.getText().match(regex);
  });
};

const getWarningPointers = (
  regex: RegExp,
  count: number
): GoogleAppsScript.Document.Paragraph[] => {
  const doc: GoogleAppsScript.Document.DocumentApp = DocumentApp;
  const activeDoc = doc.getActiveDocument();
  const body: GoogleAppsScript.Document.Body = activeDoc.getBody();
  const paragraphs: GoogleAppsScript.Document.Paragraph[] = body.getParagraphs();

  return paragraphs.filter((_) => {
    Logger.log(_.getText());
    Logger.log(_.getText().match(regex));
    Logger.log(_.getText().match(regex)?.length);
    return (_.getText().match(regex)?.length || 0) <= count;
  });
};

const getTerms = (pointers: GoogleAppsScript.Document.Paragraph[]): string[] => {
  return pointers.map((_) => {
    const text = _.getText().trim();
    return text.substr(0, text.length - 1);
  });
};

const getDefinitions = (terms: string[]): Definition[] => {
  return terms.map((_) => new Definition(_));
};

const mutateDefinitions = () => {
  const termRegExp: RegExp = RegExp(`\\:\\s{0,}$`, 'gi');
  const termPointers = getRegExpPointers(termRegExp);
  const terms = getTerms(termPointers);
  const definitions = getDefinitions(terms);

  termPointers.forEach((_, termIndex) => {
    _.setText(`${terms[termIndex]}: ${definitions[termIndex].getExtract()}`);
  });

  const notFoundRegExp: RegExp = RegExp(`COULD NOT FIND DEFINITION :\\(`, 'gi');
  const notFoundPointers = getRegExpPointers(notFoundRegExp);
  notFoundPointers.forEach((_) => {
    _.editAsText().setBold(true);
  });

  const countWordsRegExp: RegExp = RegExp(`\\s(?!.*:)`, 'gi');
  const warningPointers = getWarningPointers(countWordsRegExp, warningCount);
  warningPointers.forEach((_) => {
    _.editAsText().setItalic(true);
  });
};
