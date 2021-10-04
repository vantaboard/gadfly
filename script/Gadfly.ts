/** @OnlyCurrentDoc */

/** Triggered when the document is opened. */
const onOpen = () => {
  const doc: GoogleAppsScript.Document.DocumentApp = DocumentApp;
  const ui: GoogleAppsScript.Base.Ui = doc.getUi();
  /** Add menu item. */
  ui.createMenu('Gadfly').addItem('Add definitions', 'mutateTerms').addToUi();
};

/**
 * Triggered when the addon is installed.
 *
 * @param {any} e
 */
const onInstall = (e: any) => {
  onOpen();
};

/** Number of words before warning. */
const warningCount = 5;

/**
 * Helper function to convert a string duration to seconds.
 *
 * @param {string} date duration specified in string format
 *
 * @returns {number} seconds converted from the given date
 */
const toSeconds = (date: string): number => {
  /**
   * Units of conversion that can be compounded to convert from any point up
   * to seconds.
   */
  const conversions = {
    year: 1,
    month: 12,
    day: 30,
    hour: 24,
    minute: 60,
    second: 60,
  };

  let _date = date.trim();

  // A regular expression is used to pull only the digits.
  let value = Number(_date.replace(/^\d*|\x/, ''));

  // A regular expression is used to pull only the time unit.
  _date = _date.replace(/\d*|\s/, '');

  // Set up flag for finding unit.
  let match: boolean = false;

  /**
   * Seek through all conversion entires for match to unit of date entered.
   * The value is then multiplied by every factor in the conversion map.
   */
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

// MediaWiki types.

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

/**
 * Interface for shared MediaWiki parameters.
 *
 * @interface
 */
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

/**
 * Interface for MediaWiki parameters used for getting page ids.
 *
 * @interface
 * @augments MediaWikiSharedParams
 */
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

/**
 * Interface for MediaWiki parameters used for extracting page content.
 *
 * @interface
 * @augments MediaWikiSharedParams
 */
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

/**
 * Class representing the definition for a given term.
 *
 * @class
 */
class Definition {
  /** entry point for MediaWiki API. */
  #apiEntry: string;
  /** Definitions to extract for later usage. */
  #extract: string;

  /**
   * Sets up the API Entrypoint, assigns and formats the given term,
   * pulls page ids, and extracted page content.
   *
   * @constructs Definition
   *
   * @param {string} t term to parse
   */
  constructor(t: string) {
    // Assign API Entrypoint.
    this.#apiEntry = 'https://en.wikipedia.org/w/api.php?';

    // Format and initialize term.
    const term: string = this.#formatTerm(t);

    /**
     * Pull multiple page ids and select the first one.
     * This is written specifically so that in the future
     * multiple ids may be chosen from. Something to add
     * to the roadmap.
     */
    const pageIDs: string[] = this.#getPageIDs(term);
    const selectedPageID: string = pageIDs[0];

    // Handles extraction of the selected page id.
    this.#extract = this.#getExtract(selectedPageID);

    /**
     * Checks for page ids that lead to dead ends from the MediaWiki API.
     */
    this.#extract = this.#checkDeadEnds(this.#extract, t);
  }
  /**
   * Checks for page ids that lead to dead ends from the MediaWiki API.
   *
   * @param {string} extract content extracted from page id
   * @param {string} t term to parse
   *
   * @returns {string} original passed extract or dead end mutation
   */
  #checkDeadEnds = (extract: string, t: string): string => {
    const notFound: RegExp = RegExp(`${t} may refer to|${t}\\sor\\s.*may refer to`, 'gi');
    if (extract.match(notFound) || !extract) {
      return 'COULD NOT FIND DEFINITION :(';
    }
    return extract;
  };

  /**
   * Formats the given term for use by the page id and extract getters
   * by turning the term lowercase, replace spaces with the http-friendly
   * ```%20``` symbols.
   *
   * Also ensures that any non-alphanumeric characters
   * are stripped from the string before it is inserted into the API
   * request.
   *
   * @param {string} term term to parse
   *
   * @returns {string} formatted term
   */
  #formatTerm = (term: string): string => {
    return term
      .toLowerCase()
      .replace(/\s/g, '%20')
      .replace(/^[^A-Z0-9]*/gi, '');
  };

  /**
   * Gets page ids through making a request and parsing the response
   * by the MediaWiki API.
   *
   * @param {string} term term to parse
   *
   * @returns {string[]} page ids
   */
  #getPageIDs = (term: string): string[] => {
    /** Sets up the parameters needed to pull page ids from the API. */
    const pageIDsParams: MediaWikiPageIDsParams = {
      origin: '*',
      action: 'query',
      format: 'json',
      list: 'search',
      utf8: 1,
      srsearch: term,
    };

    /** Request page ids from API. */
    const request: string = this.#request(this.#apiEntry, pageIDsParams);

    /** Response from API. */
    const response: string = this.#fetch(request, term);

    return this.#parsePageIDs(response);
  };

  /**
   * Parses page ids by iterating through the appropriate properties
   * until the page id is found and pushing it onto a ```string[]```
   * to be returned by the function.
   *
   * @param {string} response the response to be parsed
   *
   * @returns {string[]} parsed page ids
   */
  #parsePageIDs = (response: string): string[] => {
    /** Search property of MediaWiki action query. */
    const search: string[] = JSON.parse(response)?.query?.search;

    /** Empty ```string[]``` to store page ids. */
    const pageids: string[] = [];

    /**
     * Iterates through every key until it matches with ```pageid```,
     * and begins pushing ids onto the empty array.
     */
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

  /**
   * Gets extracted content from page ids through making a request
   * and parsing the response by the MediaWiki API.
   *
   * @param {string} id page id to extract content from
   *
   * @returns {string} extracted content
   */
  #getExtract = (id: string): string => {
    /** Sets up the parameters needed to extract content from a page id. */
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

    /** Request extract content from API. */
    const request: string = this.#request(this.#apiEntry, extractParams);

    /** Response from API. */
    const response: string = this.#fetch(request, id);

    return this.#parseExtract(response);
  };

  /**
   * Formats extracted page content by stripping sentences indicated by
   * line breaks ```\n``` as well as stripping sentences by seeking the
   * first sentence end. The API has a property for number of sentences
   * to extract, but the function they use is faulty as it assumes that
   * all periods indicate a sentence end, so in the case of a string like
   * Washington D.C., the API would treat "Washington D." as the first
   * sentence and "C." as the second.
   *
   * More formatting is done to remove optional parentheses by counting the
   * number of parentheses and removing inner parentheses first, followed by
   * the removal of other parentheses.
   *
   * Double spaces are then removed.
   *
   * Escaped quotes are moved. This might not actually be an issue but
   * the clasp logs were showing escaped double quotes, but I have an
   * idea that may have been a way of presenting it in the log rather
   * than an actual formatting consequence of the API's page extraction.
   *
   * Commas and periods that have any number of spaces between them in
   * the definition get their spaces removed as the final formatting step.
   *
   * @param {string} extract extracted page content
   *
   * @returns {string} formatted term
   */
  #formatExtract = (extract: string): string => {
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

  /**
   * Parses extracted page content by moving through the query and pages
   * properties and into the page id to return the parsed extracted content.
   *
   * @param {string} response the response to be parsed
   *
   * @returns {string} parsed extracted content
   */
  #parseExtract = (response: string): string => {
    const json = JSON.parse(response)?.query?.pages;
    const pageid = Object.keys(json)[0];
    const extract = json[pageid].extract;
    return this.#formatExtract(extract);
  };
  /**
   * Builds the url required to make a request to the MediaWiki API.
   *
   * @param {string} url api entrypoint
   * @param {MediaWikiPageIDsParams|MediaWikiExtractParams} params
   *
   * @returns {string} url with API parameters accumulated
   */
  #request = (url: string, params: MediaWikiPageIDsParams | MediaWikiExtractParams): string => {
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
  /**
   * Caches and fetches a response from the MediaWiki API.
   *
   * @param {string} url url with API parameters accumulated
   * @param {string} cacheKey key for the Google Apps Script script cache
   * @param {boolean=true} shouldCache whether caching is on or off
   *
   * @returns {string} response from the fetch request
   */
  #fetch = (url: string, cacheKey: string, shouldCache: boolean = true): string => {
    //** Instance of Script Cache. */
    const cache: GoogleAppsScript.Cache.Cache = CacheService.getScriptCache();
    if (shouldCache) {
      //** Cached response based on given cacheKey. */
      const cached: string | null = cache.get(cacheKey);

      // Return value if response previously cached.
      if (cached) return cached;
    }

    /** Response from API. */
    const response = UrlFetchApp.fetch(url).getContentText();

    /** Expiration for the response to be cached. */
    const expiration: number = toSeconds('1 month');

    if (shouldCache) {
      // Cache response.
      cache.put(cacheKey, response, expiration);
    }
    return response;
  };

  /**
   * Gets extracted content.
   *
   * @returns {string}
   */
  getExtract = (): string => this.#extract;
}

/**
 * Filters through paragraphs using regular expression matches and returns the
 * resulting paragraphs.
 *
 * @param {RegExp} regex regular expression to filter paragraphs by
 * @returns {GoogleAppsScript.Document.Paragraph[]} filtered paragraphs
 */
const getRegExpPointers = (regex: RegExp): GoogleAppsScript.Document.Paragraph[] => {
  const doc: GoogleAppsScript.Document.DocumentApp = DocumentApp;
  const activeDoc = doc.getActiveDocument();
  const body: GoogleAppsScript.Document.Body = activeDoc.getBody();
  const paragraphs: GoogleAppsScript.Document.Paragraph[] = body.getParagraphs();

  return paragraphs.filter((_) => {
    return _.getText().match(regex);
  });
};

/**
 * Filters through paragraphs that are of a low word count to return an array
 * of filtered paragraphs.
 *
 * @param {RegExp} regex regular expression to filter paragraphs by
 * @param {number} count number of words acting as a threshold for warnings
 * @returns {GoogleAppsScript.Document.Paragraph[]} filtered paragraphs
 */
const getWarningPointers = (
  regex: RegExp,
  count: number
): GoogleAppsScript.Document.Paragraph[] => {
  const doc: GoogleAppsScript.Document.DocumentApp = DocumentApp;
  const activeDoc = doc.getActiveDocument();
  const body: GoogleAppsScript.Document.Body = activeDoc.getBody();
  const paragraphs: GoogleAppsScript.Document.Paragraph[] = body.getParagraphs();

  return paragraphs.filter((_) => {
    return (_.getText().match(regex)?.length || 0) <= count;
  });
};

/**
 * Gets terms from an array of document paragraphs and trims whitespace.
 *
 * @param {GoogleAppsScript.Document.Paragraph[]} pointers document paragraphs
 *
 * @returns {string[]} array of terms
 */
const getTerms = (pointers: GoogleAppsScript.Document.Paragraph[]): string[] => {
  return pointers.map((_) => {
    const text = _.getText().trim();
    return text.substr(0, text.length - 1);
  });
};

/**
 * Gets definitions from terms by creating definition objects from the
 * ```Definition``` class.
 *
 * @param {string[]} terms terms used to create definitions
 *
 * @returns {Definition[]} array of definitions
 */
const getDefinitions = (terms: string[]): Definition[] => {
  return terms.map((_) => new Definition(_));
};

/**
 * Mutates terms with definitions gathered from the MediaWiki API.
 *
 * @param {string[]} terms terms used to create definitions
 */
const mutateTerms = () => {
  /** Regular expression to find terms from document paragraphs. */
  const termRegExp: RegExp = RegExp(`\\:\\s{0,}$`, 'gi');

  /** Pointer to document paragraphs for terms. */
  const termPointers = getRegExpPointers(termRegExp);

  /** Document terms. */
  const terms = getTerms(termPointers);

  /** Definitions of terms. */
  const definitions = getDefinitions(terms);

  // Overwrites paragraphs with definitions retrieved from the MediaWiki API.
  termPointers.forEach((_, termIndex) => {
    _.setText(`${terms[termIndex]}: ${definitions[termIndex].getExtract()}`);
  });

  /** Regular expression for definitions that were not able to be found. */
  const notFoundRegExp: RegExp = RegExp(`COULD NOT FIND DEFINITION :\\(`, 'gi');

  /** Pointer to definitions that were not found. */
  const notFoundPointers = getRegExpPointers(notFoundRegExp);

  // Turns definitions not found to bold.
  notFoundPointers.forEach((_) => {
    _.editAsText().setBold(true);
  });

  /**
   * Regular expression used for counting words after the term segment
   * of a document paragraph.
   */
  const countWordsRegExp: RegExp = RegExp(`\\s(?!.*:)`, 'gi');

  /** Pointer to warnings for definitions. */
  const warningPointers = getWarningPointers(countWordsRegExp, warningCount);

  // Turns definition warnings to italic.
  warningPointers.forEach((_) => {
    _.editAsText().setItalic(true);
  });
};
