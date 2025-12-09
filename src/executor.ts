import { Logger } from "./Logger";
import JSDOM from "jsdom";

type Language = "en" | "es" | "pt" | "da";

const defaultExplanation: { [key in Language]: string } = {
    "en": "This section was highlighted because it is relevant to your health.",
    "es": "Esta sección fue resaltada porque es relevante para su salud.",
    "pt": "Esta seção foi destacada porque é relevante para a sua saúde.",
    "da": "Denne sektion blev fremhævet, fordi den er relevant for din sundhed."
};

/*
    Applies the given lenses to the ePI's leaflet sections.
    Returns the updated ePI and any focusing errors encountered.
    @param epi The FHIR ePI resource to enhance (should be preprocessed).
    @param ips The FHIR IPS resource containing patient information.
    @param completeLenses An array of lens Library resources to apply.
    @returns An object containing the enhanced ePI and any focusing errors.
*/
export const applyLenses = async (epi:any, ips: any, completeLenses: any[]) => {
        Logger.logInfo("lensesController.ts", "focusProcess", `Found the following lenses: ${completeLenses?.map(l => getLensIdenfier(l)).join(', ')}`);

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
        
        const lensApplication = await applyLensToSections(lens, leafletSectionList, epi, ips)
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
}

const applyLensToSections = async (lens: any, leafletSectionList: any[], epi: any, ips: any) => {
    const lensIdentifier = getLensIdenfier(lens) || "Invalid Lens Name"
    let lensCode = "" 
    try {
        const lensBase64data = lens.content[0].data
        // Decode base64 with proper UTF-8 support
        lensCode = Buffer.from(lensBase64data, 'base64').toString('utf-8')
    } catch (error) {
        console.error('Lens code extraction error: ', error);
        return {
                leafletSectionList: leafletSectionList,
                explanation: ""
            }
    }
    const focusingErrors: { message: string; lensName: string; }[] = []
    try {
        // Iterate on leaflet sections
        // I want to only execute the lens all sections at a time, so I will not use a forEach
        Logger.logInfo("lensesController.ts", "focusProcess", `Applying lens ${lensIdentifier} to leaflet sections`)
        if (leafletSectionList == undefined || leafletSectionList.length == 0) {
            focusingErrors.push({
                message: "No leaflet sections found",
                lensName: lensIdentifier
            })
            return {
                leafletSectionList: leafletSectionList,
                explanation: ""
            }
        }
        if (lensCode == undefined || lensCode == "") {
            focusingErrors.push({
                message: "Lens is undefined or empty",
                lensName: lensIdentifier
            })
            return {
                leafletSectionList: leafletSectionList,
                explanation: ""
            }
        }
        if (typeof lensCode !== 'string') {
            focusingErrors.push({
                message: "Lens is not a string",
                lensName: lensIdentifier
         })
            return {
                leafletSectionList: leafletSectionList,
                explanation: ""
            }
        }

        const leafletHTMLString = getLeafletHTMLString(leafletSectionList)
        let explanation = ""

        // Create enhance function from lens
        const lensFunction = new Function("epi, ips, pv, html", lensCode)
        const resObject = lensFunction(epi, ips, {}, leafletHTMLString)
        try {
            // Execute lens and save result on ePI leaflet section
            const enhancedHtml = await resObject.enhance()
            
            // Get explanation if available - with fallback to empty string
            if (typeof resObject.explanation === 'function') {
                try {
                    explanation = await resObject.explanation()
                } catch (explanationError) {
                    // Explanation is optional, log the error but continue
                    Logger.logInfo("lensesController.ts", "focusProcess", `Lens ${lensIdentifier} explanation function failed: ${explanationError}, using empty string`)
                    explanation = ""
                }
            } else {
                Logger.logInfo("lensesController.ts", "focusProcess", `Lens ${lensIdentifier} does not have an explanation function, using empty string`)
                explanation = ""
            }
            
            const diff = leafletHTMLString.localeCompare(enhancedHtml)
            if (diff != 0) {
                Logger.logInfo("lensesController.ts", "focusProcess", `Lens ${lensIdentifier} applied to leaflet sections`)
            }

            leafletSectionList = getLeafletSectionListFromHTMLString(enhancedHtml, leafletSectionList)
        } catch (error) {
            Logger.logError("lensesController.ts", "focusProcess", `Error executing lens ${lensIdentifier} on leaflet sections`)
            console.error(error);
            focusingErrors.push({
                message: "Error executing lens",
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
        console.log(error);
        console.log("finished before expected!")
        return {
            leafletSectionList: leafletSectionList,
            explanation: "",
            focusingErrors: focusingErrors
        }
    }
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
        const lensIdentifier = lens["identifier"][0]["value"]
        return lensIdentifier
    } catch (error) {
        Logger.logError("lensesController.ts", "getLensIdenfier", "Could not extract lens identifier")
    }
    return null;
}

const getLeaflet = (epi: any) => {
    const composition = findResourceByType(epi, "Composition");
    if (!composition) {
        Logger.logError("lensesController.ts", "getLeaflet", "Composition resource not found in ePI");
        return null;
    }
    
    if (!composition.section || !Array.isArray(composition.section)) {
        Logger.logError("lensesController.ts", "getLeaflet", "Composition has no sections");
        return null;
    }
    
    // Find the main leaflet section (usually first section with subsections)
    const leafletSection = composition.section.find((s: any) => s.section && Array.isArray(s.section));
    if (!leafletSection) {
        Logger.logError("lensesController.ts", "getLeaflet", "No leaflet section with subsections found");
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

/*
const getPatientIdentifierFromPatientSummary = (ips: any) => {
    const patient = findResourceByType(ips, "Patient");
    if (!patient) {
        Logger.logWarn("lensesController.ts", "getPatientIdentifierFromPatientSummary", "Patient resource not found in IPS");
        return null;
    }
    
    if (!patient.identifier || !Array.isArray(patient.identifier) || patient.identifier.length === 0) {
        Logger.logWarn("lensesController.ts", "getPatientIdentifierFromPatientSummary", "Patient has no identifiers");
        return null;
    }
    
    return patient.identifier[0].value || null;
}
*/
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
        Logger.logError("lensesController.ts", "writeLeaflet", "Composition resource not found in ePI");
        return epi;
    }
    
    if (!composition.section || !Array.isArray(composition.section)) {
        Logger.logError("lensesController.ts", "writeLeaflet", "Composition has no sections");
        return epi;
    }
    
    // Find the main leaflet section (same logic as getLeaflet)
    const leafletSectionIndex = composition.section.findIndex((s: any) => s.section && Array.isArray(s.section));
    if (leafletSectionIndex === -1) {
        Logger.logError("lensesController.ts", "writeLeaflet", "No leaflet section with subsections found");
        // Fall back to writing to first section if it exists
        if (composition.section[0]) {
            composition.section[0].section = leafletSectionList;
        } else {
            Logger.logError("lensesController.ts", "writeLeaflet", "Composition has no sections to write leaflet to");
        }
        return epi;
    }
    
    // Write the leaflet subsections back to the same location getLeaflet reads from
    composition.section[leafletSectionIndex].section = leafletSectionList;
    
    return epi;
}
