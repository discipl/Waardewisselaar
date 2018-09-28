import { Contract, InitQuery, CodeQuery, TemplateFieldType, Template, addr } from "../../contract";
import { School, Docent } from "./interfaces";

interface AddDocentTemplate {
	docent: addr;
	toevoegen: boolean;
}

export default class AddDocentContract extends Contract<AddDocentTemplate> {
	public type: string = "DocentToevoegen";
	public version: string = "1.0";
	public description: string = "School geef aan dat een docent (niet meer) bij hun werkt.";

	public template: Template<AddDocentTemplate> = {
		docent: { type: TemplateFieldType.addr, desc: "De docent om toe te voegen of te verwijderen.", name: "Docent" },
		toevoegen: { type: TemplateFieldType.bool, desc: "Toevoegen of verwijderen.", name: "Toevoegen" }
	};

	public async init(from: addr, block: number, processor: addr, previousBlockTimestamp: number,
		previousBlockHash: string, query: InitQuery): Promise<void> {

		await query("CREATE", "docenten", "(id VARCHAR(35) PRIMARY KEY, eigenschappen JSONB NOT NULL DEFAULT '{}', "
			+ "werkgever VARCHAR(35) REFERENCES scholen(id));", []);
	}

	public async code(payload: AddDocentTemplate, from: addr, block: number, processor: addr, previousBlockTimestamp: number,
		previousBlockHash: string, query: CodeQuery): Promise<"OK" | string | void> {

		//Alleen een school mag een docent toevoegen
		const school: School | undefined = (await query("SELECT", "scholen", "WHERE id = $1;", [from])).rows[0];
		if (school === undefined) {
			return "Ongeldige gebruiker";
		}

		const docent: Docent | undefined = (await query("SELECT", "docenten", "WHERE id = $1;", [payload.docent])).rows[0];
		if (payload.toevoegen) {
			if (docent === undefined) {
				await query("INSERT", "docenten", "(id, werkgever) VALUES ($1, $2);", [payload.docent, from]);
			} else if (docent.werkgever === null) {
				docent.werkgever = from;
				await query("UPDATE", "docenten", "SET werkgever = $2 WHERE id = $1;",
					[payload.docent, docent.werkgever]);
			} else {
				return "In huidige versie kan docent maar 1 werkgever hebben.";
			}
		} else {
			if (docent === undefined || docent.werkgever !== from) {
				return "Docent is niet in dienst bij gebruiker.";
			} else {
				if (docent.eigenschappen.verledenDienstverbanden === undefined) {
					docent.eigenschappen.verledenDienstverbanden = [];
				}
				docent.eigenschappen.verledenDienstverbanden.push({ eindDatum: previousBlockTimestamp, werkgever: docent.werkgever });
				docent.werkgever = null;
				await query("UPDATE", "docenten", "SET eigenschappen = $2, werkgever = $3 WHERE id = $1;",
					[payload.docent, JSON.stringify(docent.eigenschappen), docent.werkgever]);
			}
		}

		return "OK";
	}
}