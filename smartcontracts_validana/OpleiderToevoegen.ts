import { Contract, InitQuery, CodeQuery, TemplateFieldType, Template, addr } from "../../contract";
import { Entiteit } from "./interfaces";

interface AddOpleiderTemplate {
	opleider: addr;
	toevoegen: boolean;
}

export default class AddOpleiderContract extends Contract<AddOpleiderTemplate> {
	public type: string = "OpleiderToevoegen";
	public version: string = "1.0";
	public description: string = "Duo voegt een nieuwe opleider toe of verwijderd een opleider.";

	public template: Template<AddOpleiderTemplate> = {
		opleider: { type: TemplateFieldType.addr, desc: "De opleider om toe te voegen of te verwijderen.", name: "Opleider" },
		toevoegen: { type: TemplateFieldType.bool, desc: "Toevoegen of verwijderen.", name: "Toevoegen" }
	};

	public async init(from: addr, block: number, processor: addr, previousBlockTimestamp: number,
		previousBlockHash: string, query: InitQuery): Promise<void> {

		await query("CREATE", "opleiders", "(id VARCHAR(35) PRIMARY KEY);", []);
	}

	public async code(payload: AddOpleiderTemplate, from: addr, block: number, processor: addr, previousBlockTimestamp: number,
		previousBlockHash: string, query: CodeQuery): Promise<"OK" | string | void> {

		//Alleen duo mag een opleider toevoegen
		const duo: Entiteit | undefined = (await query("SELECT", "entiteiten", "WHERE id = 'DUO';", [])).rows[0];
		if (duo === undefined || from !== duo.address) {
			return "Ongeldige gebruiker";
		}

		if (payload.toevoegen) {
			await query("INSERT", "opleiders", "(id) VALUES ($1) ON CONFLICT ON CONSTRAINT opleiders_pkey DO NOTHING;", [payload.opleider]);
		} else {
			//TODO
			return "In huidige versie kan opleider niet verwijderd worden.";
		}

		return "OK";
	}
}