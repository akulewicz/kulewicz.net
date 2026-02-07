+++
title = 'Magia terminala: tropimy intruzow SSH jednym poleceniem'
date = 2026-02-07T12:12:07+01:00
draft = false
avatar = "/images/avatar.webp"
description = "W poprzednim wpisie przeprowadziliśmy pierwszy atak na SSH z Kali Linux na jedną z maszyn w sieci, dokonaliśmy analizy śladów w logach oraz wdrożyliśmy Fail2ban jako jeden z możliwych sposobów obrony przed intruzami. Tym razem pójdziemy krok dalej i zobaczymy, jak kilkoma klasycznymi narzędziami Linuksa można szybko wyłowić adresy IP, które próbują się włamać przez SSH."
author = "Arkadiusz Kulewicz"
image = ""
categories = ["homelab"]
+++

[W poprzednim wpisie](https://kulewicz.net/blog/pierwsze-ataki-w-homelabie-od-kali-linux-do-analizy-logow-i-fail2ban/) przeprowadziliśmy pierwszy atak na SSH z Kali Linux na jedną z maszyn w sieci, dokonaliśmy analizy śladów w logach oraz wdrożyliśmy Fail2ban jako jeden z możliwych sposobów obrony przed intruzami.

Tym razem pójdziemy krok dalej i zobaczymy, jak kilkoma klasycznymi narzędziami Linuksa można szybko wyłowić adresy IP, które próbują się włamać przez SSH.

Nasz cel jest taki, aby uzyskać następujący efekt:

```bash
20  192.168.1.108
115 192.168.1.114
```

Pierwsza kolumna to liczba nieudanych prób logowania, a druga to adres IP, z jakiego te próby nastąpiły.

Osiągniemy to klasycznym jednolinijkowcem:

```bash
sudo journalctl -u ssh | grep "Failed password" | awk '{ print $11 }' | sort | uniq -c
```

## Krok 1 – wyszukujemy logi dla SSH

```bash
sudo journalctl -u ssh
```

`journalctl` to narzędzie do przeglądania logów systemd. Opcja `-u ssh` oznacza, że zostaną pokazane logi dla usługi SSH.

Po wpisaniu tego polecenia zobaczysz szereg informacji o udanych i nieudanych próbach logowania, informacje o połączeniach itp. Nas interesują linijki zawierające informacje o nieudanych logowaniach, czyli:

```bash
sty 24 19:01:33 web sshd[1428]: Failed password for root from 192.168.1.108 port 54982 ssh2
```

Problem polega na tym, że interesujące nas linijki są porozrzucane po całym pliku. Dlatego przydałoby się odsiać je od reszty.

## Krok 2 – selekcjonujemy wpisy informujące o nieudanym logowaniu

Aby odsiać interesujące nas wpisy od reszty, posłużymy się poleceniem `grep`. Całe polecenie będzie wyglądało następująco:

```bash
sudo journalctl -u ssh | grep "Failed password"
```

`grep` przepuszcza dalej tylko te linie, które zawierają podany tekst. Otrzymujemy następujący wynik:

```bash
sty 25 16:21:27 web sshd[4666]: Failed password for root from 192.168.1.108 port 39060 ssh2
sty 25 16:21:27 web sshd[4669]: Failed password for root from 192.168.1.108 port 39074 ssh2
sty 25 16:21:27 web sshd[4668]: Failed password for root from 192.168.1.108 port 39070 ssh2
sty 25 16:21:29 web sshd[4667]: Failed password for root from 192.168.1.108 port 39068 ssh2
lut 07 10:00:19 web sshd[916]: Failed password for root from 192.168.1.108 port 34658 ssh2
lut 07 10:00:19 web sshd[919]: Failed password for root from 192.168.1.108 port 34672 ssh2
lut 07 10:00:19 web sshd[916]: Failed password for root from 192.168.1.108 port 34658 ssh2
lut 07 10:00:21 web sshd[917]: Failed password for root from 192.168.1.108 port 34660 ssh2
lut 07 10:05:59 web sshd[949]: Failed password for root from 192.168.1.115 port 45206 ssh2
lut 07 10:05:59 web sshd[950]: Failed password for root from 192.168.1.115 port 45220 ssh2
lut 07 10:05:59 web sshd[948]: Failed password for root from 192.168.1.115 port 45198 ssh2
```

## Krok 3 – wyciągamy adresy IP

Aby wyciągnąć same adresy IP, skorzystamy z `awk`. Nasze polecenie rozszerzamy o dodatkowy wpis:


```bash
sudo journalctl -u ssh | grep "Failed password" | awk '{ print $11 }'
```

`awk` to potężne narzędzie, o którym śmiało można zrobić całą serię wpisów. Dlatego ograniczymy się do tego, co jest nam niezbędne. Spójrzmy jeszcze raz na strukturę linijki informującej o nieudanym logowaniu:

```bash
lut 07 10:05:59 web sshd[948]: Failed password for root from 192.168.1.115 port 45198 ssh2
```

Adres IP znajduje się w 11. kolumnie. Stąd `$11` wypisze same adresy IP:

```bash
192.168.1.108
192.168.1.108
192.168.1.115
192.168.1.115
```

## Krok 4 – sortujemy adresy IP

W moim przykładzie adresy IP są posortowane. Ale nie zawsze tak będzie. Dlatego warto je posortować. To ważne, bo narzędzie, które użyjemy w kolejnym kroku, zadziała prawidłowo tylko na posortowanych danych. W tym celu dodajemy do naszego polecenia `sort`:

```bash
sudo journalctl -u ssh | grep "Failed password" | awk '{ print $11 }' | sort
```

## Krok 5 – usuwamy powtarzające się adresy i liczymy wystąpienia

W tym kroku nastąpi prawdziwa magia. Do naszego polecenia dodajemy `uniq -c`:

```bash
sudo journalctl -u ssh | grep "Failed password" | awk '{ print $11 }' | sort | uniq -c
```

`uniq` usuwa powtarzające się linie, a opcja `-c` dodaje licznik wystąpień.

Efekt końcowy wygląda mniej więcej tak:

```bash
55 192.168.1.108
10 192.168.1.115
```

Jednym poleceniem dostajemy listę adresów IP oraz liczbę nieudanych prób logowania z każdego z nich. Jest to dla nas wyraźny sygnał, nad którymi adresami warto się pochylić i podjąć ewentualne dalszej kroki, takie jak np. ban na firewall.
