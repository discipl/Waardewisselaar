import { Contract, InitQuery, CodeQuery, TemplateFieldType, Template, addr } from "../../contract";

interface EntityTemplate {
	entiteit: string;
	address: addr;
}

export default class EntityContract extends Contract<EntityTemplate> {
	public type: string = "Entiteit";
	public version: string = "1.0";
	public description: string = "Voeg een nieuwe globale entiteit toe of wijzig deze.";

	public template: Template<EntityTemplate> = {
		entiteit: { type: TemplateFieldType.str, desc: "De entiteit.", name: "Entiteit" },
		address: { type: TemplateFieldType.addr, desc: "Address van de entiteit.", name: "Address" }
	};

	public async init(from: addr, block: number, processor: addr, previousBlockTimestamp: number,
		previousBlockHash: string, query: InitQuery): Promise<void> {

		await query("CREATE", "entiteiten", "(id VARCHAR(64) PRIMARY KEY, address VARCHAR(35));", []);
	}

	public async code(payload: EntityTemplate, from: addr, block: number, processor: addr, previousBlockTimestamp: number,
		previousBlockHash: string, query: CodeQuery): Promise<"OK" | string | void> {

		if (from !== processor) {
			return "Ongeldige gebruiker";
		}

		if (payload.entiteit.length === 0 || payload.entiteit.length > 64) {
			return "Ongeldige entiteit naam.";
		}

		await query("INSERT", "entiteiten", "(id, address) VALUES ($1, $2) ON CONFLICT ON CONSTRAINT entiteiten_pkey " +
			"DO UPDATE SET address = $2 WHERE entiteiten.id = $1;", [payload.entiteit, payload.address]);

		return "OK";
	}
}