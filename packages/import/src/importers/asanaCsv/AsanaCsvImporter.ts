import csv from "csvtojson";
import { Importer, ImportResult } from "../../types";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const j2m = require("jira2md");

type AsanaPriority = "High" | "Medium" | "Low";
type AsanaSwimlane = "To Do" | "In Progress" | "In Review" | "In QA" | "Blocked" | "Done";

interface AsanaIssueType {
  "Task ID": string;
  "Created At": string;
  "Completed At": string;
  "Last Modified": string;
  Name: string;
  Assignee: string;
  "Assignee Email": string;
  "Start Date": string;
  "Due Date": string;
  Tags: string;
  Notes: string;
  Projects: string;
  "Section/Column": AsanaSwimlane;
  Effort: string;
  "Parent Task": string;
  "Priority Rank": AsanaPriority;
}

/**
 * Import issues from an Asana CSV export.
 *
 * @param filePath  path to csv file
 * @param orgSlug   base Asana project url
 */
export class AsanaCsvImporter implements Importer {
  public constructor(filePath: string, orgSlug: string) {
    this.filePath = filePath;
    this.organizationName = orgSlug;
  }

  public get name(): string {
    return "Asana (CSV)";
  }

  public get defaultTeamName(): string {
    return "Asana";
  }

  public import = async (): Promise<ImportResult> => {
    const data = (await csv().fromFile(this.filePath)) as AsanaIssueType[];

    const importData: ImportResult = {
      issues: [],
      labels: {},
      users: {},
      statuses: {},
    };

    const assignees = Array.from(new Set(data.map(row => row["Assignee Email"])));

    for (const user of assignees) {
      importData.users[user] = {
        name: user,
      };
    }

    for (const row of data) {
      const title = row.Name;

      if (!title) {
        continue;
      }

      const url = this.organizationName ? `${this.organizationName}${row["Task ID"]}` : undefined;
      const mdDesc = j2m.to_markdown(row.Notes);
      const description = url ? `${mdDesc}\n\n[View original issue in Asana](${url})` : mdDesc;

      const priority = mapPriority(row["Priority Rank"]);

      const dueDate = row["Due Date"] ? new Date(row["Due Date"]) : undefined;

      const tags = row.Tags.split(",");

      const assigneeEmail = row["Assignee Email"];
      const assigneeId = assigneeEmail && assigneeEmail.length > 0 ? assigneeEmail : undefined;

      // const status = !!row["Completed At"] ? "Done" : "Todo"; // default behavior
      const status = mapStatus(row["Section/Column"]); // custom GSE behavior

      const estimate = parseInt(row.Effort) || undefined;

      const labels = tags.filter(tag => !!tag);

      importData.issues.push({
        title,
        description,
        status,
        priority,
        url,
        assigneeId,
        labels,
        dueDate,
        estimate,
      });

      for (const lab of labels) {
        if (!importData.labels[lab]) {
          importData.labels[lab] = {
            name: lab,
          };
        }
      }
    }

    return importData;
  };

  // -- Private interface

  private filePath: string;
  private organizationName?: string;
}

const mapPriority = (input: AsanaPriority): number => {
  const priorityMap = {
    High: 2,
    Medium: 3,
    Low: 4,
  };
  return priorityMap[input] || 0;
};

const mapStatus = (input: AsanaSwimlane): string => {
  const statusMap = {
    "To Do": "Todo",
    "In Progress": "In Progress",
    "In Review": "In Review",
    "In QA": "In Testing",
    Done: "Done",
  };
  return statusMap[input] || "Backlog";
};
