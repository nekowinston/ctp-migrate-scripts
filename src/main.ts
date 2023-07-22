import { gql, GraphQLClient } from "graphql-request";
import {
  ArchiveRepositoryMutation,
  ArchiveRepositoryMutationVariables,
  LabelIssueMutation,
  LabelIssueMutationVariables,
  RepoWithIssuesQuery,
  RepoWithIssuesQueryVariables,
  TransferIssueInput,
  TransferIssueMutation,
} from "./gql/graphql";

import { Octokit } from "octokit";
import { createOrUpdateTextFile } from "@octokit/plugin-create-or-update-text-file";

const MyOctokit = Octokit.plugin(createOrUpdateTextFile);
const octokit = new MyOctokit({
  auth: process.env.GITHUB_TOKEN,
});

const endpoint = "https://api.github.com/graphql";

const client = new GraphQLClient(endpoint, {
  headers: {
    authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
  },
});

const identity = {
  name: "github-actions[bot]",
  email: "41898282+github-actions[bot]@users.noreply.github.com",
};

const content = (repo: string) =>
  `<h2 align="center">🚧 This repository has moved to <a href="https://github.com/catppuccin/userstyles/tree/main/styles/${repo}">catppuccin/userstyles</a> 🚧</h2>

<p align="center"><img src="https://raw.githubusercontent.com/catppuccin/catppuccin/main/assets/footers/gray0_ctp_on_line.svg?sanitize=true" /></p>
<p align="center">Copyright &copy; 2021-present <a href="https://github.com/catppuccin" target="_blank">Catppuccin Org</a>
`;

const labels = {
  anilist: "LA_kwDOJCgd3c8AAAABOmOLMg",
  "brave-search": "LA_kwDOJCgd3c8AAAABOmOd4Q",
  cinny: "LA_kwDOJCgd3c8AAAABRfo3gg",
  codeberg: "LA_kwDOJCgd3c8AAAABOmOixQ",
  deepl: "LA_kwDOJCgd3c8AAAABOmOmxw",
  elk: "LA_kwDOJCgd3c8AAAABOmOozA",
  github: "LA_kwDOJCgd3c8AAAABOmOtmw",
  "hacker-news": "LA_kwDOJCgd3c8AAAABOmOzqQ",
  "ichi.moe": "LA_kwDOJCgd3c8AAAABOmO6og",
  invidious: "LA_kwDOJCgd3c8AAAABOmO9gA",
  lastfm: "LA_kwDOJCgd3c8AAAABOmPC8g",
  libreddit: "LA_kwDOJCgd3c8AAAABOmPIeQ",
  mastodon: "LA_kwDOJCgd3c8AAAABOmPM0Q",
  modrinth: "LA_kwDOJCgd3c8AAAABOmPShQ",
  nitter: "LA_kwDOJCgd3c8AAAABOmPU1Q",
  "nixos-search": "LA_kwDOJCgd3c8AAAABOmUtiQ",
  proton: "LA_kwDOJCgd3c8AAAABOmPYTQ",
  reddit: "LA_kwDOJCgd3c8AAAABOmPHCg",
  searxng: "LA_kwDOJCgd3c8AAAABOmOHyA",
  tutanota: "LA_kwDOJCgd3c8AAAABOmPdJw",
  twitch: "LA_kwDOJCgd3c8AAAABOmPgLg",
  vercel: "LA_kwDOJCgd3c8AAAABOmPlcg",
  wikiwand: "LA_kwDOJCgd3c8AAAABOmPuSQ",
  youtube: "LA_kwDOJCgd3c8AAAABOmN3Yw",
};

const repoWithIssues = gql`
  query RepoWithIssues ($repo: String!) {
    repository(name: $repo, owner: "catppuccin") {
      id
      issues(first: 30) {
        nodes {
          id
          state
        }
      }
    }
  }
`;
const transferIssue = gql`
  mutation TransferIssue($issueId: ID!, $repositoryId: ID!) {
    transferIssue(
      input: {issueId: $issueId, repositoryId: $repositoryId, createLabelsIfMissing: false}
    ) {
      issue {
        id
        title
      }
    }
  }
`;

const labelIssue = gql`
  mutation LabelIssue($issueId: ID!, $labelIds: [ID!]!) {
    addLabelsToLabelable(input: {labelableId: $issueId, labelIds: $labelIds}) {
      labelable {
        ... on Issue {
          title
          repository {
            name
          }
        }
      }
    }
  }
`;

const archiveRepository = gql`
  mutation ArchiveRepository($repositoryId: ID!) {
    archiveRepository(input: {repositoryId: $repositoryId}) {
      repository {
        name
      }
    }
  }
`;

const userstyles_id = "R_kgDOJCgd3Q";
Object.entries(labels).map(async ([repo, labelId]) => {
  const {
    updated,
    data,
  } = await octokit.createOrUpdateTextFile({
    owner: "catppuccin",
    repo: repo,
    path: "README.md",
    content: content(repo),
    author: identity,
    committer: identity,
    message: "chore: archive repository in favor of catppuccin/userstyles",
  });

  if (updated) {
    console.log(`${repo}: file updated via ${data.commit.html_url}`);
  } else {
    console.log(`${repo}: file already up to date`);
  }

  const { repository: oldRepo } = await client.request<
    RepoWithIssuesQuery,
    RepoWithIssuesQueryVariables
  >(
    repoWithIssues,
    { repo: repo },
  );
  if (!oldRepo) return;

  // transfer the issues to catppuccin/userstyles
  if (oldRepo?.issues.nodes) {
    await Promise.all(
      oldRepo?.issues.nodes?.map(async (issue) => {
        if (!issue?.id) return;

        if (issue.state === "OPEN") {
          client.request<TransferIssueMutation, TransferIssueInput>(
            transferIssue,
            {
              issueId: issue.id,
              repositoryId: userstyles_id,
            },
          ).then(async (data) => {
            if (!data.transferIssue?.issue?.id) return;

            console.log(
              `Transferred ${data.transferIssue.issue.title} to catppuccin/userstyles`,
            );

            // label them with the corresponding label in catppuccin/userstyles
            await client.request<
              LabelIssueMutation,
              LabelIssueMutationVariables
            >(
              labelIssue,
              {
                issueId: data.transferIssue.issue.id,
                labelIds: [labelId],
              },
            ).then((res) => {
              if (res.addLabelsToLabelable?.labelable?.__typename === "Issue") {
                console.log(
                  `Labeled ${res.addLabelsToLabelable?.labelable?.title}`,
                );
              }
            });
          });
        }
      }),
    );
  }

  await client.request<
    ArchiveRepositoryMutation,
    ArchiveRepositoryMutationVariables
  >(
    archiveRepository,
    {
      repositoryId: oldRepo.id,
    },
  ).then((data) => {
    console.log(`Archived ${data.archiveRepository?.repository?.name}`);
  });
});
