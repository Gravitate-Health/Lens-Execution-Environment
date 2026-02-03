import { Logger } from "./Logger";
import JSDOM from "jsdom";
import { LensExecutionConfig, ApplyLensesResult, LogEntry, LogLevel, LogSink } from "./types";
import { Worker } from 'worker_threads';
import * as path from 'path';

type Language = "en" | "es" | "pt" | "da";

const defaultExplanation: { [key in Language]: string } = {
    "en": "This section was highlighted because it is relevant to your health.",
    "es": "Esta sección fue resaltada porque es relevante para su salud.",
    "pt": "Esta seção foi destacada porque é relevante para a sua saúde.",
    "da": "Denne sektion blev fremhævet, fordi den er relevant for din sundhed."
};

/**
 * Get the default configuration for the Lens Execution Environment.
 * @returns The default LensExecutionConfig with all default values.
 */
export const getDefaultConfig = (): Required<LensExecutionConfig> => {
    return {
        lensExecutionTimeout: 1000, // 1 second default
        logging: {},
    };
};

const defaultLensLogSink = (lensId: string): LogSink => {
    return (entry: LogEntry) => {
        console.log(`${entry.timestamp} - ${entry.level} - ${entry.file} - ${entry.task} - ${entry.message}`);
    };
};

const resolveLensLogSink = (config: Required<LensExecutionConfig>, lensId: string): LogSink | undefined => {
    const logging = config.logging;
    if (logging?.disableLensLogging) {
        return undefined;
    }
    if (logging?.lensLoggerFactory) {
        return logging.lensLoggerFactory(lensId);
    }
    if (logging?.lensLogger) {
        return logging.lensLogger;
    }
    return defaultLensLogSink(lensId);
};

/*
    Applies the given lenses to the ePI's leaflet sections.
    Returns the updated ePI and any focusing errors encountered.
    @param epi The FHIR ePI resource to enhance (should be preprocessed).
    @param ips The FHIR IPS resource containing patient information.
    @param completeLenses An array of lens Library resources to apply.
    @param config Optional configuration for the LEE. Uses defaults if not provided.
    @returns An object containing the enhanced ePI and any focusing errors.
*/
export const applyLenses = async (epi:any, ips: any, completeLenses: any[], config?: LensExecutionConfig): Promise<ApplyLensesResult> => {
        // Merge provided config with defaults
        const effectiveConfig: Required<LensExecutionConfig> = {
            ...getDefaultConfig(),
            ...config
        };

        const previousLeeLogger = Logger.getSink();
        const hasCustomLeeLogger = !!effectiveConfig.logging?.leeLogger;
        if (hasCustomLeeLogger) {
            Logger.setSink(effectiveConfig.logging?.leeLogger);
        }

        try {
        
        Logger.logInfo("executor.ts", "applyLenses", `Found the following lenses: ${completeLenses?.map(l => getLensIdenfier(l)).join(', ')}`);

    // Get leaflet sectoins from ePI
    let leafletSectionList = getLeaflet(epi)
    // have all errors collected
    const focusingErrors = []
    // Iterate lenses
    for (const i in completeLenses) {
        const lens = completeLenses[i]

        // If there are lenses, we can already mark the ePI as enhanced
        epi = setCategoryCode(epi, "E", "Enhanced")
        
        const lensIdentifier = getLensIdenfier(completeLenses[i])
        const epiLanguage = getlanguage(epi)
        // const patientIdentifier = getPatientIdentifierFromPatientSummary(ips)
        
        const lensApplication = await applyLensToSections(lens, leafletSectionList, epi, ips, effectiveConfig)
        focusingErrors.push(lensApplication.focusingErrors)
        const lensApplied = !lensApplication.focusingErrors || lensApplication.focusingErrors.length == 0
        if (lensApplied) {
            leafletSectionList = lensApplication.leafletSectionList
            const validLanguage = (epiLanguage as string) in defaultExplanation ? epiLanguage as Language : "en";
            const explanationText = lensApplication.explanation || defaultExplanation[validLanguage];
            let epiExtensions = []
            if (explanationText != undefined && explanationText != "") {
                epiExtensions = getExtensions(epi)
                epiExtensions.push({
                    "extension": [
                        {
                            "url": "lens",
                            "valueCodeableReference": {
                                "reference": {
                                    "reference": "Library/" + lensIdentifier
                                }
                            }
                        },
                        {
                            "url": "elementClass",
                            "valueString": lensIdentifier
                        },
                        {
                            "url": "explanation",
                            "valueString": explanationText
                        }
                    ],
                    "url": "http://hl7.eu/fhir/ig/gravitate-health/StructureDefinition/LensesApplied"
                })
            }

            epi = setExtensions(epi, epiExtensions)
        }

    }
    epi = writeLeaflet(epi, leafletSectionList)

    return {epi, focusingErrors}
        } finally {
            if (hasCustomLeeLogger) {
                Logger.setSink(previousLeeLogger);
            }
        }
}

/**
 * Execute lens code in an isolated Worker Thread with timeout support.
 * This allows lens execution to be interrupted even if it contains blocking infinite loops.
 * 
 * @param lensCode The lens JavaScript code to execute
 * @param epi The ePI document
 * @param ips The IPS document
 * @param html The HTML string to process
 * @param timeoutMs Timeout in milliseconds
 * @param lensIdentifier Lens identifier for error messages
 * @returns Promise that resolves with enhanced HTML and explanation, or rejects on error/timeout
 */
const executeLensInWorker = async (
    lensCode: string,
    epi: any,
    ips: any,
    html: string,
    timeoutMs: number,
    _lensIdentifier: string,
    lensLogSink?: LogSink
): Promise<{ enhancedHtml: string; explanation: string }> => {
    return new Promise((resolve, reject) => {
        // Use the plain JavaScript worker file (lens-worker.js)
        // This avoids module compilation issues - the .js file is copied to dist as-is
        const workerPath = path.join(__dirname, 'lens-worker.js');
        
        const worker = new Worker(workerPath, {
            workerData: { lensCode, epi, ips, html }
        });
        
        let isSettled = false;
        
        // Set timeout to terminate worker
        const timeout = setTimeout(() => {
            if (!isSettled) {
                isSettled = true;
                worker.terminate();
                reject(new Error(`Lens execution timed out after ${timeoutMs}ms`));
            }
        }, timeoutMs);
        
        // Handle worker messages
        worker.on('message', (message: { type?: "log"; level?: LogLevel; message?: any; success?: boolean; result?: any; error?: string }) => {
            if (message?.type === "log") {
                if (lensLogSink) {
                    const entry: LogEntry = {
                        timestamp: new Date().toISOString(),
                        level: message.level || "INFO",
                        file: `lens:${_lensIdentifier}`,
                        task: "console",
                        message: message.message,
                        source: "LENS",
                        lensId: _lensIdentifier
                    };
                    lensLogSink(entry);
                }
                return;
            }
            if (!isSettled) {
                isSettled = true;
                clearTimeout(timeout);
                worker.terminate();
                
                if (message.success) {
                    resolve(message.result);
                } else {
                    reject(new Error(message.error || 'Unknown worker error'));
                }
            }
        });
        
        // Handle worker errors
        worker.on('error', (error) => {
            if (!isSettled) {
                isSettled = true;
                clearTimeout(timeout);
                reject(error);
            }
        });
        
        // Handle worker exit
        worker.on('exit', (code) => {
            if (!isSettled) {
                isSettled = true;
                clearTimeout(timeout);
                if (code !== 0) {
                    reject(new Error(`Worker stopped with exit code ${code}`));
                }
            }
        });
    });
};

const applyLensToSections = async (lens: any, leafletSectionList: any[], epi: any, ips: any, config: Required<LensExecutionConfig>) => {
    const lensIdentifier = getLensIdenfier(lens) || "Invalid Lens Name"
    let lensCode = ""
    const focusingErrors: { message: string; lensName: string; }[] = []
    try {
        const lensBase64data = extractLensBase64Data(lens)
        if (!lensBase64data) {
            throw new Error("Lens content missing: no Base64 data found in Library.content or Library.data")
        }
        // Validate lensBase64data is a string before passing to Buffer.from
        if (typeof lensBase64data !== 'string') {
            throw new Error(`Lens Base64 data must be a string, received: ${typeof lensBase64data}`)
        }
        if (lensBase64data.trim().length === 0) {
            throw new Error("Lens Base64 data is empty")
        }
        // Decode base64 with proper UTF-8 support
        lensCode = Buffer.from(lensBase64data, 'base64').toString('utf-8')
        if (!lensCode || lensCode.trim().length === 0) {
            throw new Error("Decoded lens code is empty")
        }
    } catch (error: any) {
        Logger.logError("executor.ts", "applyLensToSections", `Lens code extraction error: ${error?.message || String(error)}`);
        focusingErrors.push({
            message: `Lens code extraction error: ${error?.message || String(error)}`,
            lensName: lensIdentifier
        })
        return {
            leafletSectionList: leafletSectionList,
            explanation: "",
            focusingErrors
        }
    }
    try {
        // Iterate on leaflet sections
        // I want to only execute the lens all sections at a time, so I will not use a forEach
        Logger.logInfo("executor.ts", "applyLensToSections", `Applying lens ${lensIdentifier} to leaflet sections`)
        if (leafletSectionList == undefined || leafletSectionList.length == 0) {
            focusingErrors.push({
                message: "No leaflet sections found",
                lensName: lensIdentifier
            })
            return {
                leafletSectionList: leafletSectionList,
                explanation: "",
                focusingErrors
            }
        }
        if (lensCode == undefined || lensCode == "") {
            focusingErrors.push({
                message: "Lens is undefined or empty",
                lensName: lensIdentifier
            })
            return {
                leafletSectionList: leafletSectionList,
                explanation: "",
                focusingErrors
            }
        }
        if (typeof lensCode !== 'string') {
            focusingErrors.push({
                message: "Lens is not a string",
                lensName: lensIdentifier
         })
            return {
                leafletSectionList: leafletSectionList,
                explanation: "",
                focusingErrors
            }
        }

        const leafletHTMLString = getLeafletHTMLString(leafletSectionList)
        let explanation = ""
        try {
            const lensLogSink = resolveLensLogSink(config, lensIdentifier)
            // Execute lens in isolated Worker Thread with timeout
            const result = await executeLensInWorker(
                lensCode,
                epi,
                ips,
                leafletHTMLString,
                config.lensExecutionTimeout,
                lensIdentifier,
                lensLogSink
            );
            
            const enhancedHtml = result.enhancedHtml;
            explanation = result.explanation;
            
            const diff = leafletHTMLString.localeCompare(enhancedHtml)
            if (diff != 0) {
                Logger.logInfo("executor.ts", "applyLensToSections", `Lens ${lensIdentifier} applied to leaflet sections`)
            }

            // Parse enhanced HTML back to leaflet sections with validation
            try {
                const newLeafletSectionList = getLeafletSectionListFromHTMLString(enhancedHtml, leafletSectionList)
                if (!Array.isArray(newLeafletSectionList) || newLeafletSectionList.length === 0) {
                    Logger.logWarning("executor.ts", "applyLensToSections", `Lens ${lensIdentifier} produced empty section list, keeping original`)
                } else {
                    leafletSectionList = newLeafletSectionList
                }
            } catch (parseError: any) {
                Logger.logError("executor.ts", "applyLensToSections", `Failed to parse enhanced HTML for ${lensIdentifier}: ${parseError?.message || String(parseError)}`);
                throw new Error(`HTML parsing failed: ${parseError?.message || String(parseError)}`);
            }
        } catch (error: any) {
            const errorMessage = error?.message || error?.toString() || 'Unknown error';
            const errorStack = error?.stack || '';
            Logger.logError("executor.ts", "applyLensToSections", `Error executing lens ${lensIdentifier}: ${errorMessage}`);
            if (errorStack) {
                Logger.logError("executor.ts", "applyLensToSections", `Stack trace: ${errorStack}`);
            }
            focusingErrors.push({
                message: `Error executing lens: ${errorMessage}`,
                lensName: lensIdentifier
            })
            return {
                leafletSectionList: leafletSectionList,
                explanation: "",
                focusingErrors: focusingErrors
            }
        }

        return {
            leafletSectionList: leafletSectionList,
            explanation: explanation || "" ,
            focusingErrors: focusingErrors
        }
    } catch (error: any) {
        Logger.logError("executor.ts", "applyLensToSections", `Unexpected error: ${JSON.stringify(error)}`);
        return {
            leafletSectionList: leafletSectionList,
            explanation: "",
            focusingErrors: focusingErrors
        }
    }
}

// Extract Base64-encoded lens code from a FHIR Library resource in a robust way
const extractLensBase64Data = (lens: any): string | null => {
    if (!lens) return null

    // Preferred: Library.content as an array of Attachments with data
    if (Array.isArray(lens.content) && lens.content.length > 0) {
        // Try any element with a data field
        const withData = lens.content.find((c: any) => typeof c?.data === 'string' && c.data.length > 0)
        if (withData?.data) return withData.data

        // Support data URLs in Attachment.url (data:<mime>;base64,<payload>)
        const withDataUrl = lens.content.find((c: any) => typeof c?.url === 'string' && c.url.startsWith('data:'))
        if (withDataUrl?.url) {
            const idx = withDataUrl.url.indexOf('base64,')
            if (idx >= 0) {
                return withDataUrl.url.substring(idx + 'base64,'.length)
            }
        }
    }

    // Some lenses may embed the code directly as Library.data
    if (typeof lens.data === 'string' && lens.data.length > 0) {
        return lens.data
    }

    // Non-standard but be tolerant: content as an object instead of array
    if (lens.content && !Array.isArray(lens.content) && typeof lens.content?.data === 'string') {
        return lens.content.data
    }

    return null
}

const getLeafletHTMLString = (leafletSectionList: any[]) => {
    let htmlString = "";
    for (const i in leafletSectionList) {
        const section = leafletSectionList[i];
        if (section['text'] && section['text']['div']) {
            htmlString += section['text']['div'];
        }
        if (section['section']) {
            htmlString += getLeafletHTMLString(section['section']);
        }
        if (section['entry']) {
            for (const j in section['entry']) {
                const entry = section['entry'][j];
                if (entry['resource'] && entry['resource']['text'] && entry['resource']['text']['div']) {
                    htmlString += entry['resource']['text']['div'];
                }
                if (entry['resource'] && entry['resource']['section']) {
                    htmlString += getLeafletHTMLString(entry['resource']['section']);
                }
            }
        }
    }

    return htmlString;
}

const getLeafletSectionListFromHTMLString = (html: string, leafletSectionList: any[]) => {
    // Parse HTML and extract leaflet sections, which are divs with a xmlns="http://www.w3.org/1999/xhtml" attribute, and add them to the leafletSectionList
    const dom = new JSDOM.JSDOM(html);
    const document = dom.window.document;
    const divs = document.querySelectorAll('div[xmlns="http://www.w3.org/1999/xhtml"]');
    const newLeafletSectionList: any[] = [];

    for (let i = 0; i < divs.length; i++) {
        const div = divs[i];
        let sectionTitle = leafletSectionList[i]?.title;
        let sectionCode = leafletSectionList[i]?.code;
        if (div == undefined) {
            continue;
        }
        if (sectionTitle == undefined) {
            sectionTitle = div.querySelector('h1, h2, h3, h4, h5, h6')?.textContent || "Section " + (i + 1);
        }

        if (sectionCode == undefined) {
            sectionCode = {
                coding: [{
                    system: "http://hl7.org/fhir/CodeSystem/section-code",
                    code: "section-" + (i + 1),
                    display: sectionTitle
                }]
            };
        }

        const sectionObject: any = {
            title: sectionTitle,
            code: sectionCode,
            text: {
                status: "additional",
                div: div.outerHTML
            }
        };
        newLeafletSectionList.push(sectionObject);
    }

    return newLeafletSectionList;
}

// Helper function to find a resource by type - handles both bundles and direct resources
const findResourceByType = (resource: any, resourceType: string): any => {
    if (!resource) {
        return null;
    }
    
    // If it's the resource we're looking for, return it
    if (resource.resourceType === resourceType) {
        return resource;
    }
    
    // If it's a Bundle, search in entries
    if (resource.resourceType === "Bundle" && resource.entry && Array.isArray(resource.entry)) {
        const entry = resource.entry.find((e: any) => 
            e.resource && e.resource.resourceType === resourceType
        );
        return entry ? entry.resource : null;
    }
    
    // Resource not found
    return null;
}

const getLensIdenfier = (lens: any) => {
    try {
        const lensIdentifier = lens["name"]
        return lensIdentifier
    } catch (error) {
        Logger.logError("executor.ts", "getLensIdenfier", "Could not extract lens name (mandatory) from Library resource");
    }
    return null;
}

const getLeaflet = (epi: any) => {
    const composition = findResourceByType(epi, "Composition");
    if (!composition) {
        Logger.logError("executor.ts", "getLeaflet", "Composition resource not found in ePI");
        return null;
    }
    
    if (!composition.section || !Array.isArray(composition.section)) {
        Logger.logError("executor.ts", "getLeaflet", "Composition has no sections");
        return null;
    }
    
    // Find the main leaflet section (usually first section with subsections)
    const leafletSection = composition.section.find((s: any) => s.section && Array.isArray(s.section));
    if (!leafletSection) {
        Logger.logError("executor.ts", "getLeaflet", "No leaflet section with subsections found");
        return composition.section[0]?.section || null;
    }
    
    return leafletSection.section;
}

const setCategoryCode = (epi: any, code: string, display: string) => { 
    const composition = findResourceByType(epi, "Composition");
    
    // Ensure category structure exists
    if (!composition.category) {
        composition.category = [];
    }
    if (composition.category.length === 0) {
        composition.category.push({ coding: [] });
    }
    if (!composition.category[0].coding) {
        composition.category[0].coding = [];
    }
    if (composition.category[0].coding.length === 0) {
        composition.category[0].coding.push({});
    }
    
    composition.category[0].coding[0].code = code;
    composition.category[0].coding[0].display = display;
    
    return epi;
}

const getlanguage = (epi: any) => {
    const composition = findResourceByType(epi, "Composition");
    return composition.language || null;
}


const getExtensions = (epi: any) => {
    const composition = findResourceByType(epi, "Composition");
    return composition.extension || [];
}

const setExtensions = (epi: any, extensions: any) => {
    const composition = findResourceByType(epi, "Composition");
    composition.extension = extensions;
    return epi;
}

const writeLeaflet = (epi: any, leafletSectionList: any[]) => {
    // Mirror the logic of getLeaflet to maintain the same structure
    const composition = findResourceByType(epi, "Composition");
    if (!composition) {
        Logger.logError("executor.ts", "writeLeaflet", "Composition resource not found in ePI");
        return epi;
    }
    
    if (!composition.section || !Array.isArray(composition.section)) {
        Logger.logError("executor.ts", "writeLeaflet", "Composition has no sections");
        return epi;
    }
    
    // Find the main leaflet section (same logic as getLeaflet)
    const leafletSectionIndex = composition.section.findIndex((s: any) => s.section && Array.isArray(s.section));
    if (leafletSectionIndex === -1) {
        Logger.logError("executor.ts", "writeLeaflet", "No leaflet section with subsections found");
        // Fall back to writing to first section if it exists
        if (composition.section[0]) {
            composition.section[0].section = leafletSectionList;
        } else {
            Logger.logError("executor.ts", "writeLeaflet", "Composition has no sections to write leaflet to");
        }
        return epi;
    }
    
    // Write the leaflet subsections back to the same location getLeaflet reads from
    composition.section[leafletSectionIndex].section = leafletSectionList;
    
    return epi;
}
