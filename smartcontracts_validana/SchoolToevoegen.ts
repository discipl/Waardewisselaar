import { Contract, InitQuery, CodeQuery, TemplateFieldType, Template, addr } from "../../contract";
import { Entiteit } from "./interfaces";

interface AddSchoolTemplate {
	school: addr;
	toevoegen: boolean;
}

export default class AddSchoolContract extends Contract<AddSchoolTemplate> {
	public type: string = "SchoolToevoegen";
	public version: string = "1.0";
	public description: string = "Duo voegt een nieuwe school toe of verwijderd een school.";

	public template: Template<AddSchoolTemplate> = {
		school: { type: TemplateFieldType.addr, desc: "De school om toe te voegen of te verwijderen.", name: "School" },
		toevoegen: { type: TemplateFieldType.bool, desc: "Toevoegen of verwijderen.", name: "Toevoegen" }
	};

	public async init(from: addr, block: number, processor: addr, previousBlockTimestamp: number,
		previousBlockHash: string, query: InitQuery): Promise<void> {

		await query("CREATE", "scholen", "(id VARCHAR(35) PRIMARY KEY, eigenschappen JSONB NOT NULL DEFAULT '{}', " +
			"laatst_voldeed BIGINT, laatst_niet_voldeed BIGINT NOT NULL);", []);
	}

	public async code(payload: AddSchoolTemplate, from: addr, block: number, processor: addr, previousBlockTimestamp: number,
		previousBlockHash: string, query: CodeQuery): Promise<"OK" | string | void> {

		//Alleen duo mag een school toevoegen
		const duo: Entiteit | undefined = (await query("SELECT", "entiteiten", "WHERE id = 'DUO';", [])).rows[0];
		if (duo === undefined || from !== duo.address) {
			return "Ongeldige gebruiker";
		}

		if (payload.toevoegen) {
			await query("INSERT", "scholen", "(id, laatst_niet_voldeed) VALUES ($1, $2) ON CONFLICT ON CONSTRAINT scholen_pkey DO NOTHING;",
				[payload.school, previousBlockTimestamp]);
		} else {
			//TODO Ontsla alle werknemers
			//TODO Verwijder alle opleidingen
			//TODO Verwijder school
			return "In huidige versie kan school niet verwijderd worden.";
		}

		return "OK";
	}
}