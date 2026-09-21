/** Sample text used to fill the textarea from the empty-state chips. */

export const KUBECTL_SAMPLE = `NAMESPACE     NAME                                   READY   STATUS    RESTARTS   AGE
default       api-759db6c8f4-x2k9p                   1/1     Running   0          2d
default       worker-29skd                           1/1     Running   3          12h
kube-system   coredns-5d78c9869d-abcde               1/1     Running   0          20d
monitoring    prometheus-0                           2/2     Running   0          20d
monitoring    grafana-7c8f9d6b5-q7w8e                0/1     CrashLoopBackOff   12         3h`;

export const DOCKER_SAMPLE = `CONTAINER ID   IMAGE                    COMMAND                  CREATED        STATUS                  PORTS                                       NAMES
3f2a1b9c8d7e   nginx:1.25               "/docker-entrypoint.…"   2 hours ago    Up 2 hours              0.0.0.0:80->80/tcp, 0.0.0.0:443->443/tcp    web
9a8b7c6d5e4f   postgres:16              "docker-entrypoint.s…"   3 days ago     Up 3 days (healthy)     5432/tcp                                    db
1c2d3e4f5a6b   redis:7-alpine           "docker-entrypoint.s…"   3 days ago     Up 3 days               6379/tcp                                    cache
7e8f9a0b1c2d   myapp/worker:latest      "python worker.py"       5 minutes ago  Restarting (1) 10 seconds ago                                       worker`;

export const CSV_SAMPLE = `name,role,location,years
Ada Lovelace,Engineer,London,5
Grace Hopper,Admiral,Arlington,20
Alan Turing,Mathematician,Manchester,3`;

export interface SampleChip {
  label: string;
  text: string;
}

export const SAMPLES: SampleChip[] = [
  { label: "kubectl get pods", text: KUBECTL_SAMPLE },
  { label: "docker ps", text: DOCKER_SAMPLE },
  { label: "CSV", text: CSV_SAMPLE },
];
