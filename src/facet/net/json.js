/*
 * Facet.Net.json issues JSON AJAX requests.
 * 
 * It takes as parameters
 * 
 *  url (string or list of strings): urls to fetch
 * 
 *  handler (function(buffer or dictionary of (url: buffer))): a callback
 *  which gets invoked when all requests finish. If a single URL was passed,
 *  the callback is called with the single JSON object returned. If a list of URLs
 *  were passed, then an object is returned, mapping the URLs as passed to
 *  the responses.
 *  
 * FIXME Facet.Net.json has no error handling.
 */

Facet.Net.json = function(url, handler)
{
    if (facet_typeOf(url) === "array")
        return handle_many(url, handler, Facet.Net.json);

    var xhr = new XMLHttpRequest;

    xhr.open("GET", url, true);

    var ready = false;
    xhr.onreadystatechange = function() {
        if (xhr.readyState === 4 && xhr.status === 200 && !ready) {
            handler(JSON.parse(xhr.response), url);
            ready = true;
        }
    };
    xhr.send(null);
};
