(function () {
    const images = {
        sword: 'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEju5bkRj--vXSVBbQ5BQJYn3kVz35QQD1IEf6NDnxI5Ie7eq-S-Sh6YkMr75lWI5Pw9hNlhKdenz9fzAiuiQYWN6hnxNLx9_m-B1XQDFJGwJxjrxLLCeolauP9mvD9YYaYtY9dzTFGJmoLtAKHOYnqe4Z3GCEIIxGeoQEKGsjxv-KIDHJmdnPKlc94AXRwa/s320/Espada%20da%20Ordem.png',
        shotgun: 'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEhISlyZ5FTMNtk515SBRl7xa4D4yHisGG6vdqr20AA73SJWlk7H6JuN9yha2tLse3MCklAoGYUCT6FQLvsufeXZ_EuoIbHjVH8sk7Nn0PbjclXNcGQbxMZ3kxHQlcmtRuw2ksS_GDOQjP4I_vBVY6sTylIaEWNAe3oNxbz4vguqiLLtZDKHfN0fKdCXf9ZY/s320/ink.png',
        brassKnuckles: 'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEhpegg79kPPLZvXMLn_PMPUgiJfSMKpEigTxCLDkOhPKNbZsQtMqo_4SrH7JNGmOBIllXi66nizJU6WssMvrt-YgXVA0moMFKjDjmzLVqh6tR0oxocShg7IfYFHjlW25GKJCVTf4OVX2s5ZY-KGiL0qIpYTyPtwd74-48e-BTps3Bx0CMH6FFpLsqBTL91A/s320/Soqueiras.png',
        knife: 'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEiMy1Auh8lIT4zHxcRwpWhzA_Jk7Qu9_ILzGAJHdi60Rvu4FfUlwWVuzHuu5HXmy0JuVIpRRBJ8xA_0WGbHIHQM_lobrl3ZUA-ZGnlwQLZs4lSGI6stfHfXCyg656-qyN-nOaTLfUwBYTDX6sdWr5XhMPs5Tb6WMM7vdLneEJuWCLm4MuOpiqaQRCw9mLhN/s320/Faca.png',
        axe: 'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEhIyZF4bFM3yTMs4dPBKxXxt_-eHtSgDntPZqRc9CwWYWlCZtLyLdjTi63qCcRed-m5Ddcd4KZi5fo2guDyBGXk3B35X1lFpfJOTtNptON_eitnfUihUVehba86gRmsuD7JDSkucRcvo2cJJHAJzxDEadm6lCBwgSTNCMV4XvNGpCVVEeIUxK8-FpOfNPw8/s320/Machado.png',
        machete: 'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEhwXKDbmSRGW48rlposLbMD2H4xIQwA39v6LvrnGJhOjJTis3wOfOeC4_h_yAoMqWbPgAzTsWXM6iR4yUH4SqeY-pDEYb6fuKIXDoH7z3355fW5h6tW_vnG-9OfwWkhdnmo9BZiB5wr9-uVQX4Id5OHlcNyw2vKEyOLtqjLlqo8b8Xil3zmpTquKXOhOkAr/s320/Machete.png',
        hammer: 'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEgiC3r5t4TBIdSv9sMHwaIaGocHjDhnD1DYizZ8GBgi_Kba-KbtM8hljeRjg_u332wbOkCDXidt7nSh5n8MTqaA3F1BierA0tXbrfyh1V2MFxgqmWyk4D_9YKF-0NrO5TSFzClEJsh2IeTSs6pN-leKjEJogJxXqY6W4DEIdB0SzL47of_Vrxw9YkgWSFAT/s320/Martelo.png',
        sledgehammer: 'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEj8gpzP0SJc9j2Zsb1K2XeoYfedZRYihBaXas_bKut2b_lwRXSqOHkjHL__pmamdVhJ9nyNTaTaIPwvW_p2ntWKvx3BExg_FK46gG_ti5Cm2ZzCXS7hP_ZVkLWRUr40H-f2okfKDuEwkZ89jOY5SIbx_c2uaAu2wUl4Of24lT3r_xHVZ5AidYwuh1aLa7_j/s320/Marreta.png',
        chainsaw: 'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEhWIytinBbLwLA9l6DyHOReFOvU5wYL6jDcwVDX92aQSjOl-8v2z-ftEv3Ur2b3wW-3BFA09eXiwOU_W7DhhescDK1cATlnj51PSsxHxRdj4l_7ZXeSGvOoh6PFG93xpzI_FE6YHFtr3YgzAylhfTkUc9ppuZWcvpKaGYTjOSsNfy-Y60DchJbW0oFywSMQ/s320/Serra%20El%C3%A9trica.png',
        backpack: 'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEgmOTfY9u0Z_loviBw9gJrS9mYQ-4tQYMErCLCvrSMlj1SCj2hZI0Z4TqXBTM3SqEp31yDRglUiV0vUntoTCgw1vAFAuQ1sw1qe0oZj8acEv2KJnsu4D0iEz24N-or8dQQZNZC3WMmwMpfFbhHbYaPP1mng5m_Dcimy0wwzRenifx4uGXOd8s4dj7-XAEfT/w295-h414/Mochila.png',
        flashlight: 'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEilX9DWfYeIGG0Gzoi-JA_2TTahiX_Mpkz1ut3qUJw82L3QZP-3x9LKk_3zOgUzP5bihX8RnetgKp-UIgjdcQ41dSKjV_YtkdLNu4XmQ8LKARChKNpcX5NmPYrLoG3PFVRR0kdpQJPhm0e1sn1ONNHsS1gCahi_qNrCkJO0pTQb-GZBBlHVs4WoeSldg-t/s1600/Lanterna.png',
        lightArmor: 'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEh_4GIAm69-0y1zSykwJdvvA2-UQ-2ReN2-Qs0vSB1sHhhiX14EvqhR_Jgv8-Jpxx-wKFXbILucU_JorR32pZGdlnewBv0M_YeZu2c9gQtsiP1pYMY1SokOng8qwkSb8UHm7jn8ywi57Fo6/s320/Colete%20Leve.png',
        heavyArmor: 'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEgzFeBeCIAz5UqlsRz0e5gwVXpxeUxn4pZWeyB1dNqP4l-HBXSnavJ4Ddrs6HCB4fqYY47kKLlUBX5ULciy7L9xGwc7evILQX14EvqhR_Jgv8-Jpxx-wKFXbILucU_JorR32pZGdlnewBv0M_YeZu2c9gQtsiP1pYMY1SokOng8qwkSb8UHm7jn8ywi57Fo6/s320/Colete%20Pesado.png'
    };

    const items = [
        { name:'Mochila', weight:0, desc:'Uma mochila leve e de alta qualidade. Ela não usa nenhum espaço e aumenta sua capacidade de carga em 2 espaços.', img:images.backpack },
        { name:'Lanterna', weight:1, desc:'Ilumina lugares escuros. Você pode gastar uma ação de movimento para mirar a luz nos olhos de um ser em alcance curto e deixá-lo ofuscado por 1 rodada.', img:images.flashlight },
        { name:'Proteção Leve', weight:2, desc:'Jaqueta de couro pesada ou colete de kevlar. Fornece +5 de Defesa.', img:images.lightArmor },
        { name:'Proteção Pesada', weight:5, desc:'Fornece resistência a balístico, corte, impacto e perfuração, impõe –5 em perícias afetadas pela carga e concede +10 de Defesa.', img:images.heavyArmor },
        { name:'Munição Curta', weight:1, desc:'Um pacote de munição curta consumido ao recarregar uma arma compatível.', ammo:'Curta', img:'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEjCdDvSthuqAJb6xAZmZUUh9zgqdm7LTKzGqHpagubFAEk9PJwRd-rUCG43i2pJs2uRfxaaW8DjTlg9xlXYGq6ZwGsh6Zf4vWKMeyGYAYQAZ-UTwrZTNU1YN0DLyug-lTyPynXQVwEBjcHcXu0BC_m2JbQFEt9Sxx9yaqMasE2UumF25DFmacBQZRGBPVk4/s320/Muni%C3%A7%C3%A3o%20Leve.png' },
        { name:'Munição Longa', weight:1, desc:'Um pacote de munição longa consumido ao recarregar uma arma compatível.', ammo:'Longa', img:'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEh2EpfpR7APs0uOJgPwpdV34e2czmK6ksJRfFihwxSNbKW4h6L9PTqObOtF_Hk2WjD4QgER_fH6xMnPB2F6ttcIcDNoC4WHFMKznpXPEL5Kckz8DPtWOz4chfECe0l80fqsghJ2zBT4cXIooPgxQzgLRUQXoFqgSxu8VN8mqU31y9L_kFW16Y0sm1Fd1k1m/s320/Muni%C3%A7%C3%A3o%20Longa.png' },
        { name:'Munição Pesada', weight:1, desc:'Um pacote de munição pesada consumido ao recarregar uma arma compatível.', ammo:'Pesada', img:'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEgNDorID1yepLoHFBZDr-5TFA3odzWbyU3hlfpH8VCqkBUS3jOW7S8v4RS0c5ACFePQ7l3bB0Dzfwkewf7MgBL0-xe3wqDHQoGFvNGnGvs17Q0cPiPAVPH6q1oS7B8oSLpxoCYpwI1f2kU3zc2LoGrVbepPhlS_1SLHNE2X4aGJp-0A1d-R4K5QNoNeMUsC/s1600/Muni%C3%A7%C3%A3o%20Pesada.png' },
        { name:'Munição Especial', weight:1, desc:'Um pacote de munição especial consumido ao recarregar uma arma compatível.', ammo:'Especial', img:'' }
    ];

    const meleeWeapons = [
        { name:'Soqueira', atk:2, dmg:'1d6', crit:'20/x2', range:'Toque', skill:'Luta', img:images.brassKnuckles, weight:1 },
        { name:'Faca', atk:1, dmg:'1d4', crit:'19/x2', range:'Curto', skill:'Luta', img:images.knife, weight:1 },
        { name:'Machado', atk:1, dmg:'1d8', crit:'20/x3', range:'Curto', skill:'Luta', img:images.axe, weight:2 },
        { name:'Machete', atk:1, dmg:'1d6', crit:'19/x2', range:'Curto', skill:'Luta', img:images.machete, weight:1 },
        { name:'Martelo', atk:1, dmg:'1d6', crit:'20/x2', range:'Curto', skill:'Luta', img:images.hammer, weight:1 },
        { name:'Marreta', atk:1, dmg:'1d10', crit:'20/x2', range:'Curto', skill:'Luta', img:images.sledgehammer, weight:2 },
        { name:'Espada da Ordem', atk:1, dmg:'1d8', crit:'19/x2', range:'Curto', skill:'Luta', img:images.sword, weight:2 },
        { name:'Serra Elétrica', atk:1, dmg:'2d6', crit:'19/x2', range:'Curto', skill:'Luta', img:images.chainsaw, weight:2 }
    ];

    const rangedWeapons = [
        { name:'Pistola Antiga', atk:1, dmg:'1d12', crit:'Nenhum', range:'Curto', ammo:'Curta', capacity:8, skill:'Pontaria', img:'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEgDY0i8BFuoSDOXaJ3zTYqOx3anc7dIEorYWqNanZJsCEUk7UECBgmTUKQdU8LdW9drMKnkPzzCz2F-AOtOIgpnQv8ZPWs2f81fXo-tdSPb4lxxdM_zC6z141vHUKggjldNQ8qhMOkJEAGGeahri_HyGDFZLXPP5bu2RtATDzRzKi9nm2ljisbyprkXIdJX/s320/Pistola%20Antiga.png', weight:1 },
        { name:'Revolver', atk:1, dmg:'3d6', crit:'20/x2', range:'Curto', ammo:'Curta', capacity:6, skill:'Pontaria', img:'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEg_CAVF0yyZOaceRhCWHYOn3dkEUiGE4oQzV-UealE-Ha5rIHQAhb7N-buhA98tC9cv5V0W3lC14BcW6QgKqnK0ULVHAmVeQ3NFwTHechvdaZSNj11d2y8soKNvdZeuLWSdcABSF5A3ui35QM2_EbAsh7hB6U_uUz-HcRoXgCyCqHYFyf29U0TKA4C44iLB/s320/Revolver.png', weight:1 },
        { name:'Pistola Semiautomática', atk:2, dmg:'3d8', crit:'20/x2', range:'Curto', ammo:'Curta', capacity:10, skill:'Pontaria', img:'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEjHirntudWYc6qIolFlDOFXQVcyY1pV4CP5xjA9dqqAjrSIl54p3k5DS_GVvdJmMmjrB6FGP8it-2q-DVwrGiur1g-FQLceytq1-PPNZDtYlB6uL6wv1nWrKBQfvw4KA9cHZ-RJMdoGg5pi9YjjAoFFiwrlQDrxJZIDct31A-CdGTGkCcn0ao7eSNID3Amu/s320/Pistola%20Semiautomatica.png', weight:1 },
        { name:'Escopeta', atk:1, dmg:'4d6', crit:'20/x2', range:'Curto', ammo:'Pesada', capacity:6, skill:'Pontaria', img:images.shotgun, weight:2 },
        { name:'Escopeta (Cano Serrado)', atk:1, dmg:'4d4', crit:'20/x2', range:'Curto', ammo:'Pesada', capacity:6, skill:'Pontaria', img:'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEjFG5240EEOQNarBdO-rpF-z4qm-SBCtQn56ZGdrgKenWwUL8LhPQ5Kv9NMDb9OF68hPcou_bCltcv6ZFVM_ttO_FdSIM-ew0kp2afi7Sxf7CNS-7d7H82gGA8sOtOgLpX4wwVkDNtOGEQnvLwN23T47/s1600/Escopeta%20(Cano%20Curto).png', weight:1 },
        { name:'Rifle de Caça', atk:1, dmg:'2d8', crit:'20/x3', range:'Longo', ammo:'Longa', capacity:8, skill:'Pontaria', img:'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEggsCPtD9E3NIeKOEWWOP9PoSksns_aujAsGCwckjwwVZWlCZtLyLdjTi63qCcRed-m5Ddcd4KZi5fo2guDyBGXk3B35X1lFpfJOTtNptOHlcNyw2vKEyOLtqjLlqo8b8Xil3zmpTquKXOhOkAr/s320/Rifle%20de%20Ca%C3%A7a.png', weight:2 },
        { name:'Rifle de Precisão', atk:1, dmg:'3d12', crit:'20/x4', range:'Longo', ammo:'Longa', capacity:5, skill:'Pontaria', img:'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEixO8xjcZa2veeKqEBsBy9IW9CHSNg1Q95lKnF9AvxcE7-KP8eH58kQbuvewBKegOo1RAzBX5eELigpgKfMko8h9RWYFDeBNmUF4WU9L1Q4oGVQMbiPimFEkpkHEMUB_fZ_eYE68G2uWs77GybvjgeNFnPZvEt0k/s320/Fuzil%20de%20Precis%C3%A3o.png', weight:2 },
        { name:'Rifle de Assalto', atk:3, dmg:'3d8', crit:'20/x2', range:'Longo', ammo:'Longa', capacity:40, skill:'Pontaria', img:'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEhshxGarqLO8U3YpKbogrMsFrGfwWOY_j02soq_ogqPXDi79QD_oj8-NunnC0ieo6wVDDv0oReOl64aEY48yq3fUC_a3F2IXyDw3qsfdUhOuoOsC7jxPZ9vReTQDmq7-XXDpB-vAhKqHBHjTqxW06UI_9sKFgoBQ8BBfkphIYFDjUu-bCFxSp1e-N-6r3/s320/Fuzil%20de%20Assalto.png', weight:2 },
        { name:'Balestra', atk:1, dmg:'4d12', crit:'20/x2', range:'Longo', ammo:'Especial', capacity:1, skill:'Pontaria', img:'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEgOpGdW-ic-yI5QTUw-8hDv6X51cXuM0hAwVgwpyeepkFk9nx5e0oTbPDuZfNyWAnYtQqpKLnajKxYlvfRp9HpaCSWACJWyE7EQxnwzPXBq9IluC70uvFYQFWd5UzlXJZM1ApVisRTari6xcFdEmfUqfKSlN0mNwHYwDMxkgoC79KlM_mwNnhmOK0Wmonbf/s320/Balestra.png', weight:2 }
    ];

    window.RPG_CATALOG = { items, meleeWeapons, rangedWeapons };
})();
