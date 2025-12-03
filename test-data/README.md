# Test Data

This directory contains sample FHIR resources for testing the Lens Execution Environment.

## Structure

- **`epis/`** - Electronic Product Information (ePI) documents as FHIR Bundles
- **`ips/`** - International Patient Summary (IPS) documents as FHIR Bundles  
- **`lenses/`** - Lens transformation logic as FHIR Library resources

## Adding Your Own Test Data

### Adding an ePI

Create a JSON file in the `epis/` directory with a FHIR Bundle containing a Composition resource with leaflet sections. The sections should have HTML content in the `text.div` field.

Example structure:
```json
{
  "resourceType": "Bundle",
  "type": "document",
  "entry": [{
    "resource": {
      "resourceType": "Composition",
      "section": [{
        "title": "Leaflet",
        "section": [{
          "title": "Section Title",
          "text": {
            "div": "<div xmlns=\"http://www.w3.org/1999/xhtml\">Content here</div>"
          }
        }]
      }]
    }
  }]
}
```

### Adding an IPS

Create a JSON file in the `ips/` directory with a FHIR Bundle containing Patient, AllergyIntolerance, Condition, and other clinical resources.

### Adding a Lens

Create a JSON file in the `lenses/` directory with a FHIR Library resource. The lens code must be Base64-encoded JavaScript in the `content[0].data` field.

The JavaScript should return an object with:
- `enhance()` - function that transforms the HTML
- `explanation()` - (optional) function that returns explanation text

Example lens code (before Base64 encoding):
```javascript
return {
  enhance: function() {
    return html.replace(/keyword/gi, '<mark>$&</mark>');
  },
  explanation: function() {
    return 'Highlighted keywords in the document';
  }
};
```

## Running Tests

```bash
npm test
```

The tests will automatically discover and test all combinations of ePIs, IPSs, and lenses in these directories.
