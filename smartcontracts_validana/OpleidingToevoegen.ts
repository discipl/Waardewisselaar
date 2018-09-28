import { Contract, InitQuery, CodeQuery, TemplateFieldType, Template, addr } from "../../contract";
import { Opleiding, Opleider } from "./interfaces";

interface AddOpleidingTemplate {
	opleiding: string;
	toevoegen: boolean;
}

export default class AddOpleidingContract extends Contract<AddOpleidingTemplate> {
	public type: string = "OpleidingToevoegen";
	public version: string = "1.0";
	public description: string = "Opleider geef aan dat een opleiding (niet meer) bij hun gevolgt kan worden.";

	public template: Template<AddOpleidingTemplate> = {
		opleiding: { type: TemplateFieldType.hash, desc: "De opleiding om toe te voegen of te verwijderen.", name: "Opleiding" },
		toevoegen: { type: TemplateFieldType.bool, desc: "Toevoegen of verwijderen.", name: "Toevoegen" }
	};

	public async init(from: addr, block: number, processor: addr, previousBlockTimestamp: number,
		previousBlockHash: string, query: InitQuery): Promise<void> {

		await query("CREATE", "opleidingen", "(id BYTEA PRIMARY KEY CHECK (octet_length(id) = 32), " +
			"eigenschappen JSONB NOT NULL DEFAULT '{}', opleider VARCHAR(35) REFERENCES opleiders(id) NOT NULL);", []);
	}

	public async code(payload: AddOpleidingTemplate, from: addr, block: number, processor: addr, previousBlockTimestamp: number,
		previousBlockHash: string, query: CodeQuery): Promise<"OK" | string | void> {

		//Alleen een opleider mag een opleiding toevoegen
		const opleider: Opleider | undefined = (await query("SELECT", "opleiders", "WHERE id = $1;", [from])).rows[0];
		if (opleider === undefined) {
			return "Ongeldige gebruiker";
		}

		const binaryOpleiding = Buffer.from(payload.opleiding, "hex");
		const opleiding: Opleiding | undefined = (await query("SELECT", "opleidingen", "WHERE id = $1;", [binaryOpleiding])).rows[0];
		if (payload.toevoegen) {
			if (opleiding === undefined) {
				await query("INSERT", "opleidingen", "(id, opleider) VALUES ($1, $2);", [binaryOpleiding, from]);
			} else {
				return "Opleiding bestaat al.";
			}
		} else {
			if (opleiding === undefined) {
				return "Opleiding bestaat niet.";
			} else {
				//TODO Verwijder opleidingen
				return "In huidige versie kan opleiding niet verwijderd worden.";
			}
		}

		return "OK";
	}
}