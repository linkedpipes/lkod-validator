import { SparqlEndpointFetcher } from "fetch-sparql-endpoint";

import { ValidationReporter } from "./validator-api";
import { validateCatalogFromQuads } from "./catalog-validator-quads";
import { validateDatasetFromQuads } from "./dataset-validator-quads";

const GROUP = "sparql.group";

const fetcher = new SparqlEndpointFetcher();

/**
 * Unliked other validators, once we are in SPARQL endpoint,
 * we are not leaving it.
 */
export async function validateCatalogFromSparql(
  reporter: ValidationReporter,
  url: string
): Promise<undefined> {
  const query = createCatalogQuery();
  let quads;
  try {
    quads = await executeConstruct(url, query);
  } catch (error) {
    reporter.critical(GROUP, "fetch-failed", { error });
    return;
  }
  reporter.info(GROUP, "validator.quad-count", { count: quads.length });
  // We use custom dataset validator, as we do not want to load
  // any additional data.
  const validateDataset = async (
    reporter: ValidationReporter,
    datasetUrl: string
  ) => {
    const query = createDatasetQuery(datasetUrl);
    let quads;
    try {
      quads = await executeConstruct(url, query);
    } catch (error) {
      reporter.error(GROUP, "fetch-failed", { error });
      return;
    }
    // Validate as RDF.
    reporter.beginDatasetValidation(datasetUrl);
    await validateDatasetFromQuads(reporter, quads, datasetUrl);
    reporter.endResourceValidation();
  };
  // Validate as RDF.
  await validateCatalogFromQuads(reporter, validateDataset, quads, url, false);
}

/**
 * Query all statements about catalog and publisher.
 */
function createCatalogQuery(): string {
  return `
PREFIX dcat: <http://www.w3.org/ns/dcat#>
PREFIX dcterms: <http://purl.org/dc/terms/>

CONSTRUCT { 
  ?catalog ?catalogPredicate ?catalogObject .
  ?publisher ?publisherPredicate ?publisherObject .
} WHERE {
  ?catalog a dcat:Catalog ;
    ?catalogPredicate ?catalogObject .
    
  OPTIONAL {
    ?catalog dcterms:publisher ?publisher .
    ?publisher ?publisherPredicate ?publisherObject .
  }

}`;
}

async function executeConstruct(url: string, query: string): Promise<object[]> {
  const bindingsStream = await fetcher.fetchTriples(url, query);
  return new Promise((accept, reject) => {
    const collector = [];
    bindingsStream.on("data", binding => collector.push(binding));
    bindingsStream.on("end", () => accept(collector));
    bindingsStream.on("error", error => reject(error));
  });
}

/**
 * Query all statements about dataset.
 */
function createDatasetQuery(dataset: string): string {
  return `
PREFIX dcat: <http://www.w3.org/ns/dcat#>
PREFIX dcterms: <http://purl.org/dc/terms/>

CONSTRUCT { 
  <${dataset}> ?p ?o .
} WHERE {
  <${dataset}> ?p ?o.  
}`;
}