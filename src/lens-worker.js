/**
 * Worker thread for executing lens code in isolation.
 * This allows lens execution to be interrupted even if it contains blocking infinite loops.
 * 
 * This file is intentionally kept as plain JavaScript to avoid module/compilation issues.
 */
const { parentPort, workerData } = require('worker_threads');

try {
  const { lensCode, epi, ips, html } = workerData;
  
  // Create the lens function from code
  const lensFunction = new Function("epi, ips, pv, html", lensCode);
  
  // Execute the lens function to get the result object
  const resObject = lensFunction(epi, ips, {}, html);
  
  if (!resObject || typeof resObject !== 'object') {
    throw new Error(`Lens function must return an object, received: ${typeof resObject}`);
  }
  
  if (typeof resObject.enhance !== 'function') {
    throw new Error(`Lens must provide an enhance() function`);
  }
  
  // Execute enhance() - this is where the lens does its work
  Promise.resolve(resObject.enhance()).then((enhancedHtml) => {
    if (typeof enhancedHtml !== 'string') {
      throw new Error(`enhance() must return a string, received: ${typeof enhancedHtml}`);
    }
    
    // Execute explanation() if available
    if (typeof resObject.explanation === 'function') {
      return Promise.resolve(resObject.explanation()).then((explanationResult) => ({
        enhancedHtml,
        explanation: explanationResult !== undefined && explanationResult !== null ? String(explanationResult) : ""
      }));
    } else {
      return { enhancedHtml, explanation: "" };
    }
  }).then((result) => {
    // Send successful result back to parent
    if (parentPort) {
      parentPort.postMessage({ success: true, result });
    }
  }).catch((error) => {
    // Send error back to parent
    if (parentPort) {
      parentPort.postMessage({ 
        success: false, 
        error: error && error.message ? error.message : String(error) 
      });
    }
  });
  
} catch (error) {
  // Send synchronous errors back to parent
  if (parentPort) {
    parentPort.postMessage({ 
      success: false, 
      error: error && error.message ? error.message : String(error) 
    });
  }
}
